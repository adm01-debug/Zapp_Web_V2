-- whisper_audio_path
-- Rollback: remove a policy de SELECT nova do storage, o gatilho, a funcao de validacao, a constraint de formato e a coluna audio_path de public.whisper_messages.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Whisper audio readable by whisper member" on storage.objects;
--   drop trigger if exists whisper_messages_valida_audio_path on public.whisper_messages;
--   drop function if exists public.whisper_messages_valida_audio_path();
--   alter table public.whisper_messages drop constraint if exists whisper_messages_audio_path_formato;
--   alter table public.whisper_messages drop column if exists audio_path;
--
-- Nota de audio do sussurro (nota interna por voz, paridade V3 WhisperMode -> V2).
-- A V3 guardava a URL assinada de 7 dias em `audio_url` (WhisperMode.tsx:238); aqui guardamos
-- o CAMINHO do objeto no bucket e a assinatura acontece na leitura. O bucket e o
-- `audio-messages` que a V2 ja usa (privado desde 20260905030000 e membro de
-- PRIVATE_MEDIA_BUCKETS em src/lib/storage_object_reference.ts) para o locator ser
-- resolvido por useResolvedStorageUrl sem trilha nova.
--
-- Formato do caminho: `<uid>/<conversa>/<uuid>` (3 segmentos, os tres UUID).
--   `<uid>`      = auth.uid() de quem grava -> mantem a policy de INSERT existente
--                  ("Users can upload assigned audio messages") e a de DELETE
--                  ("Users can delete own audio messages"), que exigem foldername[1] = auth.uid().
--   `<conversa>` = contacts.id da conversa do sussurro.
--   `<uuid>`     = identificador estavel do objeto (createStorageObjectId).
--
-- Visibilidade da leitura: espelha a da propria linha de sussurro (remetente, agente destino
-- ou admin/supervisor) pela policy nova "Whisper audio readable by whisper member". Nenhuma
-- policy existente e trocada nem removida: a migration e aditiva.
--
-- Limite de tamanho/duracao: o bucket `audio-messages` e compartilhado com o audio de mensagem
-- enviada, entao o limite NAO e aplicado no bucket (isso mudaria o audio de mensagem comum).
-- O limite e aplicado por gatilho na linha do sussurro, que so aceita referenciar um objeto
-- que existe, e de audio, com ate 10 MiB; quando o upload declara `duration` no metadata do
-- objeto, ate 300 s. O audio cru pode ate subir, mas nenhum sussurro pode apontar para ele.

SET search_path = public, storage, pg_temp;

-- 1. Coluna do caminho (locator), nullable: as notas de sussurro de texto continuam valendo.
alter table public.whisper_messages
  add column if not exists audio_path text;

-- 2. Formato do caminho. Ancora ^...$ com classe de caractere por segmento: recusa '..',
--    caminho absoluto, barra dupla, segmento vazio, espaco, extensao e segmento a mais.
alter table public.whisper_messages
  drop constraint if exists whisper_messages_audio_path_formato;

alter table public.whisper_messages
  add constraint whisper_messages_audio_path_formato
  check (
    audio_path is null
    or audio_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

-- 3. Limite de tamanho/duracao e integridade do locator. SECURITY DEFINER porque o
--    remetente nao enxerga o objeto pela RLS de storage.objects antes da linha do sussurro
--    existir (a policy nova depende da propria linha); a funcao so LE metadata do objeto.
--    search_path fixo; chamavel apenas como gatilho (retorna trigger), sem EXECUTE para
--    PUBLIC/anon/authenticated (negado por padrao).
create or replace function public.whisper_messages_valida_audio_path()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_limite_bytes bigint := 10485760; -- 10 MiB
  v_limite_segundos numeric := 300;  -- 5 min
  v_size bigint;
  v_mime text;
  v_duracao numeric;
begin
  if new.audio_path is null then
    return new;
  end if;

  select (o.metadata->>'size')::bigint,
         o.metadata->>'mimetype',
         nullif(o.metadata->>'duration', '')::numeric
    into v_size, v_mime, v_duracao
    from storage.objects o
   where o.bucket_id = 'audio-messages'
     and o.name = new.audio_path;

  if not found then
    raise exception 'audio_path % nao existe no bucket audio-messages; envie o audio antes de gravar o sussurro', new.audio_path
      using errcode = '23514';
  end if;

  if v_size is null or v_size <= 0 then
    raise exception 'nao consegui medir o tamanho do audio do sussurro'
      using errcode = '23514';
  end if;

  if v_size > v_limite_bytes then
    raise exception 'audio do sussurro com % bytes excede o limite de % bytes', v_size, v_limite_bytes
      using errcode = '23514';
  end if;

  if v_mime is null or v_mime not like 'audio/%' then
    raise exception 'audio do sussurro com tipo % nao e audio', coalesce(v_mime, '(ausente)')
      using errcode = '23514';
  end if;

  if v_duracao is not null and v_duracao > v_limite_segundos then
    raise exception 'audio do sussurro com % s excede o limite de % s', v_duracao, v_limite_segundos
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.whisper_messages_valida_audio_path() from public, anon, authenticated;

drop trigger if exists whisper_messages_valida_audio_path on public.whisper_messages;
create trigger whisper_messages_valida_audio_path
  before insert or update of audio_path on public.whisper_messages
  for each row execute function public.whisper_messages_valida_audio_path();

-- 4. Leitura do audio do sussurro pelos mesmos membros que enxergam a linha: remetente,
--    agente destino ou admin/supervisor. `storage.objects.name` qualificado de proposito
--    (sem ele o nome do objeto fica coberto pela coluna da subquery). Igualdade exata, sem LIKE.
drop policy if exists "Whisper audio readable by whisper member" on storage.objects;
create policy "Whisper audio readable by whisper member"
  on storage.objects for select to authenticated
  using (
    storage.objects.bucket_id = 'audio-messages'
    and exists (
      select 1
        from public.whisper_messages w
       where w.audio_path = storage.objects.name
         and (
           w.sender_id in (select p.id from public.profiles p where p.user_id = auth.uid())
           or w.target_agent_id in (select p.id from public.profiles p where p.user_id = auth.uid())
           or public.is_admin_or_supervisor(auth.uid())
         )
    )
  );

comment on column public.whisper_messages.audio_path is
  'Caminho do audio da nota de sussurro no bucket audio-messages (<uid>/<conversa>/<uuid>); locator, assinado na leitura. NULL em sussurro de texto.';
