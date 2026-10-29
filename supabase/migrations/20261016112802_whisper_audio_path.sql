-- whisper_audio_path
-- Rollback: remove a policy de SELECT nova do storage, o gatilho, a funcao de validacao,
--           as duas constraints de formato e a coluna audio_path de public.whisper_messages.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Whisper audio readable by whisper member" on storage.objects;
--   drop trigger if exists whisper_messages_valida_audio_path on public.whisper_messages;
--   drop function if exists public.whisper_messages_valida_audio_path();
--   alter table public.whisper_messages drop constraint if exists whisper_messages_audio_path_do_remetente;
--   alter table public.whisper_messages drop constraint if exists whisper_messages_audio_path_formato;
--   alter table public.whisper_messages drop column if exists audio_path;
--
-- Nota de audio do sussurro (nota interna por voz). Guardamos o CAMINHO do objeto no
-- bucket privado `audio-messages` (a assinatura acontece na leitura), nunca URL assinada.
--
-- Formato do caminho: `<uid>/<conversa>/<uuid>` (3 segmentos, os tres UUID).
--   <uid>      = auth.uid() de quem grava -> casa com as policies JA existentes do bucket
--                ("Users can upload assigned audio messages" e "Users can delete own audio
--                messages"), que exigem foldername[1] = auth.uid()::text. Por isso esta
--                migration NAO cria policy de escrita: o upload e a limpeza do proprio
--                audio seguem funcionando sem widar nada.
--   <conversa> = contacts.id da conversa do sussurro.
--   <uuid>     = identificador do objeto.
--
-- Ancoramento (o furo que o revisor apontou na versao anterior): valor de caminho e
-- ANCORADO a linha, nao apenas "existe no bucket".
--   - CHECK `whisper_messages_audio_path_do_remetente`: split_part(audio_path,'/',2) =
--     contact_id::text. Uma linha nao aponta para a conversa de outra.
--   - gatilho `whisper_messages_valida_audio_path`: 1o segmento = user_id do perfil do
--     remetente (new.sender_id) e, quando existe sessao, = auth.uid()::text. Assim ninguem
--     cita objeto da pasta de outro agente para ganhar leitura pela policy nova.
--   - o mesmo gatilho so aceita referenciar objeto existente no bucket, de audio (`audio/%`)
--     e de ate 10 MiB.
--
-- Duracao: o limite de 300 s so vale quando o upload DECLARA `duration` no metadata do
-- objeto em `storage.objects`. O supabase-js manda o metadata do upload para
-- `user_metadata` (nao para `metadata`), entao na pratica hoje so o teto de tamanho (10 MiB)
-- e aplicado; o teto de duracao fica registrado aqui e no relato, sem prometer o que nao
-- acontece. O bucket `audio-messages` e compartilhado com o audio de mensagem enviada, por
-- isso o limite mora na linha do sussurro e nao na configuracao do bucket.
--
-- Aditiva: nenhuma coluna, policy ou ACL existente e removida ou trocada.

alter table public.whisper_messages
  add column if not exists audio_path text;

-- Formato: ancora ^...$ com classe de caractere por segmento. Recusa '..', caminho
-- absoluto, barra dupla, segmento vazio, espaco, extensao e segmento a mais.
alter table public.whisper_messages
  drop constraint if exists whisper_messages_audio_path_formato;
alter table public.whisper_messages
  add constraint whisper_messages_audio_path_formato
  check (
    audio_path is null
    or audio_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
  );

-- A conversa do caminho tem de ser a conversa da propria linha.
alter table public.whisper_messages
  drop constraint if exists whisper_messages_audio_path_do_remetente;
alter table public.whisper_messages
  add constraint whisper_messages_audio_path_do_remetente
  check (
    audio_path is null
    or split_part(audio_path, '/', 2) = contact_id::text
  );

-- Gatilho de integridade e ancoramento. SECURITY DEFINER porque o remetente nao enxerga o
-- objeto pela RLS de storage.objects antes da linha existir (a policy de leitura depende da
-- propria linha); a funcao so LE o metadata do objeto. search_path fixo e EXECUTE revogado
-- de PUBLIC/anon/authenticated: so vale como gatilho.
--
-- Teto de duracao (decisao registrada): o limite de 300 s SO vale quando o proprio objeto
-- DECLARA `duration` em storage.objects.metadata. Hoje o app sobe com o supabase-js, que grava
-- o `metadata` do upload em `user_metadata` e nao em `metadata`; entao na pratica o teto de
-- duracao nao e aplicado e quem manda e o teto de tamanho (10 MiB), esse sempre valido. Se o
-- app passar a declarar `duration`, o teto entra sozinho. Nada quebra: a linha sem `duration`
-- continua aceita, como o caso legitimo da prova.
create or replace function public.whisper_messages_valida_audio_path()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_limite_bytes bigint := 10485760; -- 10 MiB
  v_limite_segundos numeric := 300;  -- 5 min, so quando o objeto declara duration
  v_remetente uuid;
  v_size bigint;
  v_mime text;
  v_duracao numeric;
begin
  if new.audio_path is null then
    return new;
  end if;

  -- (1) o caminho tem de estar na pasta do remetente da propria linha
  select profile.user_id into v_remetente
    from public.profiles as profile
   where profile.id = new.sender_id;

  if v_remetente is null then
    raise exception 'sussurro com audio exige remetente com perfil'
      using errcode = '23514';
  end if;

  if split_part(new.audio_path, '/', 1) <> v_remetente::text then
    raise exception 'audio_path % nao esta na pasta do remetente', new.audio_path
      using errcode = '23514';
  end if;

  if auth.uid() is not null and split_part(new.audio_path, '/', 1) <> auth.uid()::text then
    raise exception 'audio_path % nao esta na propria pasta', new.audio_path
      using errcode = '23514';
  end if;

  -- (2) o caminho tem de ser da conversa da propria linha
  if split_part(new.audio_path, '/', 2) <> new.contact_id::text then
    raise exception 'audio_path % nao e da conversa % do sussurro', new.audio_path, new.contact_id
      using errcode = '23514';
  end if;

  -- (3) o objeto tem de existir no bucket, ser audio e caber no teto
  select (o.metadata->>'size')::bigint,
         o.metadata->>'mimetype',
         nullif(o.metadata->>'duration', '')::numeric
    into v_size, v_mime, v_duracao
    from storage.objects as o
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

-- Leitura do audio do sussurro pelos mesmos membros que enxergam a linha: remetente, agente
-- destino ou admin/supervisor. `storage.objects.name` qualificado de proposito (sem ele o
-- nome do objeto fica coberto pela coluna da subquery). Igualdade exata, sem LIKE.
drop policy if exists "Whisper audio readable by whisper member" on storage.objects;
create policy "Whisper audio readable by whisper member"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audio-messages'
    and exists (
      select 1
        from public.whisper_messages as w
       where w.audio_path = storage.objects.name
         and (
           public.is_admin_or_supervisor(auth.uid())
           or w.sender_id in (select p.id from public.profiles p where p.user_id = auth.uid())
           or w.target_agent_id in (select p.id from public.profiles p where p.user_id = auth.uid())
         )
    )
  );

comment on column public.whisper_messages.audio_path is
  'Caminho do audio da nota de sussurro no bucket privado audio-messages, no formato <uid>/<conversa>/<uuid>; locator, assinado na leitura. NULL no sussurro de texto.';
