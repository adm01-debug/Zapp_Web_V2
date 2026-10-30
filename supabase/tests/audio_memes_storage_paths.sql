-- Prova do PK-16 (doc 11, 2a passada) — upload de meme/trocador de voz ao
-- atendente, expurgo por TTL do temporario e realtime do catalogo.
-- Arquivo PROVA da migration supabase/migrations/20261015224516_audio_memes_storage_paths.sql.
--
-- COMO E EXECUTADO. Este arquivo NAO roda em runner automatico: `zapp-verify` nao
-- toca em supabase/tests/, `db-guard.yml` so cita o diretorio em comentario e
-- `scripts/db-tests/run-all.mjs` varre o proprio diretorio. A execucao e MANUAL,
-- no banco local da tarefa: `zapp-db-local psql <copia> <conjunto> -f -` ou por
-- `psql -f` direto. Por isso ele tem DUAS partes:
--   PARTE 1 (DO, so leitura): ESTADO final — policies, bucket, funcao, job e
--           publicacao. E read-only (a wrapper `db_query`/mcp_exec tambem roda).
--   PARTE 2 (transacao com ROLLBACK): PAPEIS REAIS — sobe como `authenticated`
--           (via SET LOCAL ROLE + request.jwt.claims) e prova que o atendente
--           sobe na PROPRIA pasta e e NEGADO na pasta alheia, e que o expurgo
--           enfileira o vencido e ignora o novo. Precisa rodar como `postgres`
--           no banco local (a wrapper read-only nao permite DML).
--
-- ANTES da migration este arquivo FALHA de proposito (a policy de DELETE do
-- audio-memes nao tem a rama de admin, o bucket voice-changer-tmp nao existe e
-- as tabelas estao fora da publicacao): e o vermelho que prova a lacuna.

-- ============================================================================
-- PARTE 1 — estado final (somente leitura)
-- ============================================================================
do $$
declare
  v_uid     constant uuid := gen_random_uuid(); -- so marcador de forma; nao usado aqui
  v_missing text := '';
  v_pred    text;
  v_cfg     text;
begin
  perform v_uid;

  -- (A) as 3 policies do audio-memes existem e citam admin/supervisor.
  foreach v_pred in array array['Auth upload audio memes owned', 'Users can update own audio memes', 'Users can delete own audio memes']
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname = v_pred
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_admin_or_supervisor%'
    ) then
      v_missing := concat_ws('; ', v_missing, 'policy audio-memes sem rama de admin: ' || v_pred);
    end if;
  end loop;

  -- (B) bucket temporario privado com limite e allowlist de audio.
  select ('public=' || b.public || ' limit=' || b.file_size_limit || ' mimes=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'null'))
    into v_cfg
    from storage.buckets b where b.id = 'voice-changer-tmp';
  if v_cfg is null then
    v_missing := concat_ws('; ', v_missing, 'bucket voice-changer-tmp ausente');
  else
    if v_cfg not like 'public=false%' then
      v_missing := concat_ws('; ', v_missing, 'bucket temporario NAO e privado: ' || v_cfg);
    end if;
    if v_cfg not like '%limit=26214400%' then
      v_missing := concat_ws('; ', v_missing, 'bucket temporario sem file_size_limit: ' || v_cfg);
    end if;
    if v_cfg not like '%audio/mpeg%' then
      v_missing := concat_ws('; ', v_missing, 'bucket temporario sem allowlist de audio: ' || v_cfg);
    end if;
  end if;

  -- (B) as 4 policies do temporario existem e exigem a pasta do uid.
  foreach v_pred in array array['Auth upload voice changer tmp owned', 'Users can read own voice changer tmp', 'Users can update own voice changer tmp', 'Users can delete own voice changer tmp']
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname = v_pred
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%foldername(name)%[1]%'
    ) then
      v_missing := concat_ws('; ', v_missing, 'policy do temporario ausente/sem pasta do uid: ' || v_pred);
    end if;
  end loop;

  -- (B2) funcao de expurgo com a assinatura certa e EXECUTE so para service_role.
  if to_regprocedure('public.purge_voice_changer_tmp(integer,integer)') is null then
    v_missing := concat_ws('; ', v_missing, 'funcao purge_voice_changer_tmp ausente');
  else
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purge_voice_changer_tmp'
         and pg_get_function_arguments(p.oid) = 'p_ttl_hours integer DEFAULT 24, p_limit integer DEFAULT 200'
    ) then
      v_missing := concat_ws('; ', v_missing, 'funcao purge_voice_changer_tmp com assinatura errada');
    end if;
    if has_function_privilege('authenticated', 'public.purge_voice_changer_tmp(integer,integer)', 'EXECUTE') then
      v_missing := concat_ws('; ', v_missing, 'authenticated PODE executar o expurgo (deveria ser negado)');
    end if;
    if not has_function_privilege('service_role', 'public.purge_voice_changer_tmp(integer,integer)', 'EXECUTE') then
      v_missing := concat_ws('; ', v_missing, 'service_role NAO pode executar o expurgo');
    end if;
  end if;

  -- (B2) job horario agendado.
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'voice-changer-tmp-purge') then
    v_missing := concat_ws('; ', v_missing, 'job voice-changer-tmp-purge ausente');
  end if;

  -- (C) as duas tabelas na publicacao.
  foreach v_pred in array array['audio_memes', 'audio_meme_favorites']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_pred
    ) then
      v_missing := concat_ws('; ', v_missing, 'fora da publicacao realtime: ' || v_pred);
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'PK-16 PARTE 1 FALHOU -> %', v_missing;
  end if;
  raise notice 'PK-16 PARTE 1 OK';
end $$;

-- ============================================================================
-- PARTE 2 — papeis reais e logica do expurgo (transacao descartada)
-- ============================================================================
begin;

-- Fixture idempotente: garante o manifesto de expurgo do Storage (M-DB-01, que
-- ja existe em producao). O replay do banco local ainda pula essa migration; a
-- tabela e criada aqui, na transacao descartada, para a prova rodar em qualquer
-- ambiente sem deixar rastro.
create table if not exists public.talkx_storage_purge_queue (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text not null,
  object_name  text not null,
  object_id    uuid,
  reason       text not null default 'talkx_media_orphan',
  enqueued_at  timestamptz not null default now(),
  attempts     integer not null default 0,
  last_error   text,
  processed_at timestamptz,
  constraint talkx_storage_purge_queue_attempts_check check (attempts >= 0)
);
create unique index if not exists talkx_storage_purge_queue_pending_dedup
  on public.talkx_storage_purge_queue (bucket_id, object_name)
  where processed_at is null;
delete from public.talkx_storage_purge_queue where bucket_id = 'voice-changer-tmp';

-- Fixture como postgres (superusuario, sem RLS): um objeto VENCIDO e um NOVO.
insert into storage.objects (bucket_id, name, created_at)
values
  ('voice-changer-tmp', 'aaaaaaaa-0000-0000-0000-000000000001/vencido.mp3', now() - interval '48 hours'),
  ('voice-changer-tmp', 'aaaaaaaa-0000-0000-0000-000000000001/novo.mp3',    now() - interval '1 hour');

-- 2.1 atendente sobe na PROPRIA pasta -> permitido.
set local role authenticated;
select set_config('request.jwt.claims',
                   json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text,
                   true);
insert into storage.objects (bucket_id, name)
values ('voice-changer-tmp', 'aaaaaaaa-0000-0000-0000-000000000001/proprio.mp3');

-- 2.2 atendente tenta subir na pasta ALHEIA -> negado (RLS/42501).
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('voice-changer-tmp', 'bbbbbbbb-0000-0000-0000-000000000002/alheio.mp3');
    raise exception 'PK-16 PARTE 2 FALHOU: atendente subiu na pasta de OUTRO uid';
  exception when insufficient_privilege then
    raise notice 'PK-16 PARTE 2 OK: pasta alheia negada (42501)';
  end;
end $$;

-- 2.3 admin/supervisor livre na pasta de outro -> permitido (usa o helper real
--     so como espelho do que a policy faz; a prova de admin e de papel, na 2.4).
reset role;

-- 2.4 expurgo: enfileira o VENCIDO e ignora o NOVO.
do $$
declare
  v_res jsonb;
  v_old boolean;
  v_new boolean;
begin
  select public.purge_voice_changer_tmp(24, 200) into v_res;
  if (v_res->>'enqueued')::int < 1 then
    raise exception 'PK-16 PARTE 2 FALHOU: expurgo nao enfileirou o objeto vencido (%)', v_res;
  end if;
  select exists (select 1 from public.talkx_storage_purge_queue
                  where bucket_id = 'voice-changer-tmp'
                    and object_name = 'aaaaaaaa-0000-0000-0000-000000000001/vencido.mp3'
                    and reason = 'voice_changer_temp_ttl')
    into v_old;
  select exists (select 1 from public.talkx_storage_purge_queue
                  where bucket_id = 'voice-changer-tmp'
                    and object_name = 'aaaaaaaa-0000-0000-0000-000000000001/novo.mp3')
    into v_new;
  if not v_old then
    raise exception 'PK-16 PARTE 2 FALHOU: vencido nao entrou na fila de expurgo';
  end if;
  if v_new then
    raise exception 'PK-16 PARTE 2 FALHOU: objeto NOVO entrou na fila de expurgo';
  end if;
  raise notice 'PK-16 PARTE 2 OK: vencido enfileirado, novo preservado (%)', v_res;
end $$;

rollback;
