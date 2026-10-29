-- audio_memes_storage_paths
-- Rollback: desfaz SO o que este cartao cria: desagenda o job de expurgo, dropa a funcao, devolve as 3 policies de storage do bucket audio-memes ao estado anterior (a de DELETE volta a NAO ter a rama de admin/supervisor), remove a publicacao realtime dos dois catalogos e remove o bucket temporario do trocador de voz (so quando vazio; objetos remanescentes ficam para o drenador de expurgo).
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'voice-changer-tmp-purge'; end if; end $$;
--   drop function if exists public.purge_voice_changer_tmp(integer, integer);
--   do $$ begin if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audio_meme_favorites') then alter publication supabase_realtime drop table public.audio_meme_favorites; end if; end $$;
--   do $$ begin if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audio_memes') then alter publication supabase_realtime drop table public.audio_memes; end if; end $$;
--   do $$ begin perform set_config('storage.allow_delete_query','true',true); delete from storage.buckets where id = 'voice-changer-tmp' and not exists (select 1 from storage.objects where bucket_id = 'voice-changer-tmp'); end $$;
--   drop policy if exists "Users can delete own voice changer tmp" on storage.objects;
--   drop policy if exists "Users can update own voice changer tmp" on storage.objects;
--   drop policy if exists "Users can read own voice changer tmp" on storage.objects;
--   drop policy if exists "Auth upload voice changer tmp owned" on storage.objects;
--   drop policy if exists "Users can delete own audio memes" on storage.objects;
--   create policy "Users can delete own audio memes" on storage.objects for delete to authenticated using (bucket_id = 'audio-memes' and (storage.foldername(name))[1] = (auth.uid())::text);
--   drop policy if exists "Users can update own audio memes" on storage.objects;
--   create policy "Users can update own audio memes" on storage.objects for update to authenticated using (bucket_id = 'audio-memes' and (public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::text));
--   drop policy if exists "Auth upload audio memes owned" on storage.objects;
--   create policy "Auth upload audio memes owned" on storage.objects for insert to authenticated with check (bucket_id = 'audio-memes' and (public.is_admin_or_supervisor(auth.uid()) or (storage.foldername(name))[1] = (auth.uid())::text));
--
-- PARIDADE V3 / PK-16 (doc 11, 2a passada). Tres achados no mesmo modulo de audio:
--
-- (A) UPLOAD DE MEME. As policies vivas de storage.objects para o bucket
--     `audio-memes` exigem, para o atendente comum, que o objeto esteja na pasta
--     `<auth.uid()>/` (INSERT/UPDATE/DELETE). O caminho de upload da V2
--     (`meme_<ts>_<uuid>.ext`, sem pasta de usuario) nao cabia nessa regra; a
--     correcao do CAMINHO e do PK-17 (hugo). No BANCO, INSERT e UPDATE JA tinham
--     a rama de `is_admin_or_supervisor` para admin/supervisor, mas a policy de
--     DELETE tinha PERDIDO essa rama (reconstrucoes de 20260402214625 e
--     20260511233306): um admin/supervisor NAO conseguia apagar o arquivo de um
--     meme enviado por outro. Esta migration recria as TRES policies de forma
--     canonica (pasta do uid OU admin/supervisor) para INSERT/UPDATE/DELETE.
--
-- (B) TROCADOR DE VOZ. Cada envio grava um mp3 novo e NUNCA apagava; o destino
--     era uma pasta dentro do bucket `audio-memes`, que e PUBLICO (qualquer um
--     le). Aqui nasce um bucket PRIVADO `voice-changer-tmp` com as mesmas regras
--     de pasta e um EXPURGO por TTL: funcao `public.purge_voice_changer_tmp()` +
--     job pg_cron horario (molde PE-102 = funcao + cron.schedule).
--
--     POR QUE FILA E NAO `DELETE FROM storage.objects`: o gatilho
--     `storage.protect_objects_delete` recusa DELETE direto na tabela
--     (42501) — a regra da casa (M-DB-01) e enfileirar o objeto e deixar o
--     drenador existente (`talkx-storage-purge`, ler public.talkx_storage_purge_queue)
--     apagar pela API do Storage. Como `talkx_storage_purge_queue` e a UNICA fila
--     de expurgo de Storage do repositorio e o drenador e generico (apaga por
--     bucket_id/object_name, sem filtrar `reason`), o expurgo do temporario usa a
--     MESMA fila com `reason='voice_changer_temp_ttl'`. Nao existe segundo
--     drenador, e criar um seria trabalho de Edge (fora desta area).
--
-- (C) REALTIME. `audio_memes` e `audio_meme_favorites` ficaram FORA da publicacao
--     `supabase_realtime`: o catalogo e os favoritos nao atualizavam ao vivo (o
--     front do PK-18, hugo, assina as duas tabelas). Aqui as duas entram.
--
-- So ADITIVO: nenhuma tabela/coluna/dado existente e alterado; as policies
-- recriadas mantem a semantica viva (so acrescentam a rama de admin no DELETE).
--
-- Permissao: `purge_voice_changer_tmp` e manutencao (roda pelo job). EXECUTE
-- negado a PUBLIC/anon/authenticated; so service_role executa.

-- ============================================================================
-- (A) Policies de storage do bucket audio-memes: pasta do uid OU admin/supervisor
-- ============================================================================
drop policy if exists "Auth upload audio memes owned" on storage.objects;
create policy "Auth upload audio memes owned" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio-memes'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

drop policy if exists "Users can update own audio memes" on storage.objects;
create policy "Users can update own audio memes" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'audio-memes'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  )
  with check (
    bucket_id = 'audio-memes'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

drop policy if exists "Users can delete own audio memes" on storage.objects;
create policy "Users can delete own audio memes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'audio-memes'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

-- ============================================================================
-- (B) Bucket temporario PRIVADO do trocador de voz + policies de pasta do uid
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-changer-tmp',
  'voice-changer-tmp',
  false,
  26214400, -- 25 MiB, folga para um envio de voz
  array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Auth upload voice changer tmp owned" on storage.objects;
create policy "Auth upload voice changer tmp owned" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-changer-tmp'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

drop policy if exists "Users can read own voice changer tmp" on storage.objects;
create policy "Users can read own voice changer tmp" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-changer-tmp'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

drop policy if exists "Users can update own voice changer tmp" on storage.objects;
create policy "Users can update own voice changer tmp" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'voice-changer-tmp'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  )
  with check (
    bucket_id = 'voice-changer-tmp'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

drop policy if exists "Users can delete own voice changer tmp" on storage.objects;
create policy "Users can delete own voice changer tmp" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'voice-changer-tmp'
    and (
      public.is_admin_or_supervisor(auth.uid())
      or (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

-- ============================================================================
-- (B2) Expurgo por TTL: funcao (enfileira vencidos) + job horario
-- ============================================================================
create or replace function public.purge_voice_changer_tmp(
  p_ttl_hours integer default 24,
  p_limit     integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  c_bucket constant text := 'voice-changer-tmp';
  v_enq    integer := 0;
begin
  -- Enfileira na fila unica de expurgo de Storage os objetos temporarios ja
  -- vencidos (mais antigos primeiro). O drenador existente (Edge talkx-storage-purge)
  -- apaga pela API do Storage; aqui NAO se toca storage.objects direto.
  insert into public.talkx_storage_purge_queue (bucket_id, object_name, object_id, reason)
  select o.bucket_id, o.name, o.id, 'voice_changer_temp_ttl'
    from storage.objects o
   where o.bucket_id = c_bucket
     and o.created_at < now() - make_interval(hours => greatest(p_ttl_hours, 1))
   order by o.created_at
   limit greatest(p_limit, 1)
  on conflict (bucket_id, object_name) where processed_at is null do nothing;

  get diagnostics v_enq = row_count;

  return jsonb_build_object(
    'enqueued',  v_enq,
    'bucket',    c_bucket,
    'ttl_hours', greatest(p_ttl_hours, 1)
  );
end;
$$;

comment on function public.purge_voice_changer_tmp(integer, integer) is
  'Expurgo por TTL do bucket privado voice-changer-tmp: enfileira em talkx_storage_purge_queue os objetos mais antigos que p_ttl_hours (o drenador da M-DB-01 apaga pela API do Storage). Devolve a contagem enfileirada.';

revoke all on function public.purge_voice_changer_tmp(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_voice_changer_tmp(integer, integer) to service_role;

-- Job horario (idempotente). Minute 17 para nao colidir com os jobs do minuto 0.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'voice-changer-tmp-purge';
    perform cron.schedule(
      'voice-changer-tmp-purge',
      '17 * * * *',
      $job$select public.purge_voice_changer_tmp(24, 200);$job$
    );
  end if;
end $$;

-- ============================================================================
-- (C) Realtime: catalogo e favoritos de memes ao vivo
-- ============================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.audio_memes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.audio_meme_favorites;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- Blindagem: a migration so passa se o estado final existir
-- ============================================================================
do $$
declare
  v_missing text := '';
  v_pred    text;
begin
  -- (A) as 3 policies do audio-memes existem e as de INSERT/UPDATE/DELETE citam admin.
  foreach v_pred in array array['Auth upload audio memes owned', 'Users can update own audio memes', 'Users can delete own audio memes']
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname = v_pred
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_admin_or_supervisor%'
    ) then
      v_missing := concat_ws(', ', v_missing, 'policy audio-memes sem admin: ' || v_pred);
    end if;
  end loop;

  -- (B) bucket privado com limites.
  if not exists (
    select 1 from storage.buckets
     where id = 'voice-changer-tmp' and public = false and file_size_limit = 26214400
  ) then
    v_missing := concat_ws(', ', v_missing, 'bucket voice-changer-tmp ausente/nao-privado/sem limite');
  end if;

  -- (B) funcao de expurgo.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purge_voice_changer_tmp'
  ) then
    v_missing := concat_ws(', ', v_missing, 'funcao purge_voice_changer_tmp ausente');
  end if;

  -- (B) job agendado (quando pg_cron existe).
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'voice-changer-tmp-purge') then
    v_missing := concat_ws(', ', v_missing, 'job voice-changer-tmp-purge ausente');
  end if;

  -- (C) as duas tabelas na publicacao.
  foreach v_pred in array array['audio_memes', 'audio_meme_favorites']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_pred
    ) then
      v_missing := concat_ws(', ', v_missing, 'fora da publicacao realtime: ' || v_pred);
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'audio_memes_storage_paths: estado final incompleto -> %', v_missing;
  end if;
end $$;
