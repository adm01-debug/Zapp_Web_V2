-- agendadores_edge_e_purga_cron
-- Rollback: desagenda os SEIS jobs criados por esta migration (somente do dono atual),
-- remove o indice e as funcoes que esta migration adicionou e devolve a base ao
-- estado de 20261009000118, sem tocar em nenhum job de outro dono.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where username = current_user and jobname in ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs','purge-crm-sync-outbox','purge-ai-rate-limits','purge-cron-job-run-details');
--   drop function if exists public.apply_zapp_agendadores_e_purga_cron();
--   drop index if exists public.scheduled_reports_due_idx;
--   drop function if exists public.purge_cron_job_run_details(integer, integer);
--   drop function if exists public.zapp_purge_ai_rate_limits(integer);
--   drop function if exists public.zapp_purge_crm_sync_outbox(integer, integer, integer);
--   drop function if exists public.claim_due_scheduled_reports(integer);
--   drop function if exists public.next_report_send_at(text, timestamp with time zone);
--
-- ============================================================================
-- Cartao: agendadores Edge + purga do log do cron (py-102)
-- ============================================================================
-- O que estava errado
-- -------------------
-- A interface promete coisas que nenhum agendador cumpria:
--   * AutoCloseSettings (tela de auto-fechamento) -> a edge `auto-close-conversations`
--     nunca era chamada; conversa parada nunca fechava sozinha.
--   * Relatorios agendados -> `scheduled_reports.next_send_at` era gravado pela tela,
--     mas nenhum job vencia a linha; o relatorio nunca saia (a edge
--     `send-scheduled-report` existia e nao tinha chamador).
--   * `cleanup-rate-limit-logs` tambem nao tinha agendador.
--   * `cron.job_run_details` crescendo sem fim: o log do pg_cron nunca era expurgado.
-- Dos 13 jobs do pg_cron, estes tres nao existiam. Esta migration fecha a lacuna
-- criando SEIS jobs, cadencia decidida com o dono do card e registrada no relato.
--
-- Decisoes registradas (nao agendados aqui)
-- ----------------------------------------
--   * `recover-corrupted-audios`: NAO agendada. A edge nao tem gate de credencial de
--     maquina (x-cron-secret) e usa credenciais de Evolution; agendar exigiria mudar a
--     Edge (area do worker edge). Fica registrado no relato e no cartao filho.
--   * `send-rate-limit-alert`: NAO agendada. Nao tem chamador no repo e usa
--     INTERNAL_ALERT_SECRET (nao o CRON_SECRET); candidata a aposentadoria. Registrado.
--
-- Segredo
-- -------
-- O CRON_SECRET e UM valor compartilhado por varias edges (runbook
-- docs/runbooks/cron-secret-rotation.md): a MESMA string vive no env da Edge
-- (copiada de Supabase Secrets pelo deploy-functions.yml) e no Vault sob o nome
-- historico `gmail_cron_secret`. As tres edges daqui conferem `x-cron-secret` contra
-- esse valor em tempo constante, por isso os jobs o leem direto do Vault (nunca
-- escrevemos o valor na migration). Nao criamos segredo novo: um valor aleatorio novo
-- nao casaria com o env da Edge e o job tomaria 401. Trocar/rotacionar o segredo e
-- assunto do runbook, nao desta migration.
--
-- Como o job roda
-- ---------------
--   * Jobs de Edge: net.http_post para /functions/v1/<edge> com `x-cron-secret` e
--     timeout > 0 (mesmo molde de 20260930250000). As tres edges precisam de
--     `verify_jwt = false` em supabase/config.toml para o gateway nao barrar o cron com
--     401 antes do x-cron-secret: registrado no relato (area deploy/edge).
--   * Jobs de SQL: `cron.schedule` com o comando SQL direto, chamando as funcoes de
--     manutencao abaixo.
--   * Nenhum DML direto em cron.job: só cron.schedule/unschedule/alter_job (licao do
--     42501 de 20260930430000).
--
-- Idempotencia
-- ------------
-- `apply_zapp_agendadores_e_purga_cron()` usa IF cron.job (mesmo nome + mesmo dono)
-- entao alter_job, senao cron.schedule. Reaplicar nao cria job duplicado nem toca job
-- de outro doeno; nome homonimo de outro dono levanta erro em vez de sobrescrever.
-- ============================================================================


-- ============================================================================
-- 1) Cadencia do proximo envio do relatorio agendado (fonte unica no SQL)
-- ============================================================================
-- Ancorada no proprio `next_send_at` (nao em now()): se o tick atrasar 10 min, o
-- proximo envio continua na mesma hora do dia — a cadencia nao caminha com o atraso.
create or replace function public.next_report_send_at(p_frequency text, p_from timestamptz)
returns timestamptz
language sql
immutable
as $function$
  select case coalesce(p_frequency, 'weekly')
           when 'daily'   then p_from + interval '1 day'
           when 'weekly'  then p_from + interval '7 days'
           when 'monthly' then p_from + interval '1 month'
           else                p_from + interval '7 days'
         end;
$function$;

comment on function public.next_report_send_at(text, timestamptz) is
  'PE-102: avanca p_from conforme frequency (daily=+1d, weekly=+7d, monthly=+1 mes). '
  'Ancorado no next_send_at atual para a cadencia nao andar com o atraso do tick.';


-- ============================================================================
-- 2) RPC de reivindicacao dos relatorios vencidos (PE-102)
-- ============================================================================
-- A edge `send-scheduled-report` chama esta RPC com o service role (auth.role() =
-- 'service_role' no PostgREST). Ela REIVINDICA de forma atomica: locka so as linhas
-- vencidas (FOR UPDATE SKIP LOCKED) e JA AVANCA next_send_at na mesma transacao —
-- por isso um tick nunca reenvia o mesmo relatorio (sem duplicidade) e outro
-- chamador concorrente nao pega a mesma linha.
create or replace function public.claim_due_scheduled_reports(p_limit integer default 25)
returns table (
  id uuid,
  name text,
  report_type text,
  frequency text,
  recipients text[],
  format text,
  next_send_at timestamptz,
  last_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limit integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_claim_limit' using errcode = '22023';
  end if;

  v_limit := least(p_limit, 200);

  return query
  with vencidos as (
    select r.id
      from public.scheduled_reports as r
     where coalesce(r.is_active, true)
       and r.next_send_at is not null
       and r.next_send_at <= now()
     order by r.next_send_at
     limit v_limit
     for update skip locked
  )
  update public.scheduled_reports as s
     set next_send_at = public.next_report_send_at(s.frequency, s.next_send_at),
         updated_at   = now()
   where s.id in (select v.id from vencidos as v)
  returning s.id, s.name, s.report_type, s.frequency, s.recipients, s.format,
            s.next_send_at, s.last_sent_at;
end;
$function$;

comment on function public.claim_due_scheduled_reports(integer) is
  'PE-102: reivindica ate p_limit relatorios vencidos (is_active e next_send_at <= now()) '
  'com FOR UPDATE SKIP LOCKED e avanca next_send_at no mesmo passo (nao duplica envio). '
  'Chamavel apenas pelo service_role.';


-- ============================================================================
-- 3) Expurgo do log do pg_cron (retencao de 7 dias)
-- ============================================================================
create or replace function public.purge_cron_job_run_details(
  p_retention_days integer default 7,
  p_limit integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_days integer;
  v_limit integer;
  v_deleted integer;
begin
  v_days  := least(greatest(coalesce(p_retention_days, 7), 1), 90);
  v_limit := least(greatest(coalesce(p_limit, 10000), 1), 100000);

  begin
    with expirados as (
      select d.runid
        from cron.job_run_details as d
       where coalesce(d.end_time, d.start_time) < now() - make_interval(days => v_days)
       order by coalesce(d.end_time, d.start_time)
       limit v_limit
    )
    delete from cron.job_run_details as d
     using expirados as e
     where d.runid = e.runid;
    get diagnostics v_deleted = row_count;
  exception when insufficient_privilege then
    -- Nao mascara a falha: cron.job_run_details e de supabase_admin em producao.
    -- Sem DELETE, todo expurgo falharia em silencio; aqui o job do pg_cron registra
    -- a falha com instrucao acionavel em vez de "rodou e nao apagou nada".
    raise exception 'cron_job_run_details_sem_permissao' using
      errcode = '42501',
      hint = 'conceda DELETE em cron.job_run_details ao dono desta funcao, ou rode o expurgo como supabase_admin';
  end;

  return v_deleted;
end;
$function$;

comment on function public.purge_cron_job_run_details(integer, integer) is
  'PE-102: apaga de cron.job_run_details as execucoes com mais de p_retention_days dias '
  '(teto de 90) em lotes de p_limit; devolve quantas linhas removeu.';


-- ============================================================================
-- 4) Envelopes de manutencao chamados pelo cron (rolam como o dono da funcao)
-- ============================================================================
-- cleanup_crm_sync_outbox exige auth.role() = 'service_role' (guarda propria); o job do
-- pg_cron nao tem JWT, entao o envelope liga a claim na transacao antes de chamar
-- (mesmo padrao de 20260929610000_multiplix_cron_window_and_limits).
create or replace function public.zapp_purge_crm_sync_outbox(
  p_succeeded_days integer default 90,
  p_dead_letter_days integer default 180,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.cleanup_crm_sync_outbox(p_succeeded_days, p_dead_letter_days, p_limit);
end;
$function$;

comment on function public.zapp_purge_crm_sync_outbox(integer, integer, integer) is
  'PE-102: envelope do cron para public.cleanup_crm_sync_outbox (liga a claim service_role na transacao).';

create or replace function public.zapp_purge_ai_rate_limits(p_retention_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.ai_rate_limit_purge(now() - make_interval(days => least(greatest(coalesce(p_retention_days, 7), 1), 90)));
end;
$function$;

comment on function public.zapp_purge_ai_rate_limits(integer) is
  'PE-102: envelope do cron para public.ai_rate_limit_purge (contadores de rate limit de IA parados).';


-- ============================================================================
-- 5) Indice parcial para o claim dos vencidos
-- ============================================================================
create index if not exists scheduled_reports_due_idx
  on public.scheduled_reports (next_send_at)
  where coalesce(is_active, true) and next_send_at is not null;


-- ============================================================================
-- 6) Agendador versionado e idempotente
-- ============================================================================
create or replace function public.apply_zapp_agendadores_e_purga_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_jobid       bigint;
  v_dono_alheio text;
  v_criados     text[] := array[]::text[];
  v_alterados   text[] := array[]::text[];
begin
  -- ---- auto-close-conversations (a cada 10 min; a tela promete fechar sozinho) ----
  select jobid into v_jobid from cron.job
   where jobname = 'auto-close-conversations' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'auto-close-conversations' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job auto-close-conversations pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'auto-close-conversations',
      '4-59/10 * * * *',
      $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auto-close-conversations',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) AS request_id$cmd$
    );
    v_criados := array_append(v_criados, 'auto-close-conversations');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '4-59/10 * * * *',
      command := $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auto-close-conversations',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) AS request_id$cmd$
    );
    v_alterados := array_append(v_alterados, 'auto-close-conversations');
  end if;

  -- ---- send-scheduled-report (a cada 15 min; reivindica os vencidos pela RPC) ----
  select jobid into v_jobid from cron.job
   where jobname = 'send-scheduled-report' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'send-scheduled-report' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job send-scheduled-report pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'send-scheduled-report',
      '9-59/15 * * * *',
      $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/send-scheduled-report',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_criados := array_append(v_criados, 'send-scheduled-report');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '9-59/15 * * * *',
      command := $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/send-scheduled-report',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_alterados := array_append(v_alterados, 'send-scheduled-report');
  end if;

  -- ---- cleanup-rate-limit-logs (1x/dia, 04:14 BRT) ----
  select jobid into v_jobid from cron.job
   where jobname = 'cleanup-rate-limit-logs' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'cleanup-rate-limit-logs' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job cleanup-rate-limit-logs pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'cleanup-rate-limit-logs',
      '14 4 * * *',
      $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/cleanup-rate-limit-logs',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_criados := array_append(v_criados, 'cleanup-rate-limit-logs');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '14 4 * * *',
      command := $cmd$SELECT net.http_post(
        url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/cleanup-rate-limit-logs',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_alterados := array_append(v_alterados, 'cleanup-rate-limit-logs');
  end if;

  -- ---- purge-crm-sync-outbox (1x/dia, 04:19 BRT) ----
  select jobid into v_jobid from cron.job
   where jobname = 'purge-crm-sync-outbox' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'purge-crm-sync-outbox' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job purge-crm-sync-outbox pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'purge-crm-sync-outbox',
      '19 4 * * *',
      'SELECT public.zapp_purge_crm_sync_outbox()'
    );
    v_criados := array_append(v_criados, 'purge-crm-sync-outbox');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '19 4 * * *',
      command := 'SELECT public.zapp_purge_crm_sync_outbox()'
    );
    v_alterados := array_append(v_alterados, 'purge-crm-sync-outbox');
  end if;

  -- ---- purge-ai-rate-limits (1x/dia, 04:24 BRT) ----
  select jobid into v_jobid from cron.job
   where jobname = 'purge-ai-rate-limits' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'purge-ai-rate-limits' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job purge-ai-rate-limits pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'purge-ai-rate-limits',
      '24 4 * * *',
      'SELECT public.zapp_purge_ai_rate_limits(7)'
    );
    v_criados := array_append(v_criados, 'purge-ai-rate-limits');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '24 4 * * *',
      command := 'SELECT public.zapp_purge_ai_rate_limits(7)'
    );
    v_alterados := array_append(v_alterados, 'purge-ai-rate-limits');
  end if;

  -- ---- purge-cron-job-run-details (1x/dia, 03:29 BRT; retencao de 7 dias) ----
  select jobid into v_jobid from cron.job
   where jobname = 'purge-cron-job-run-details' and username = current_user;
  if v_jobid is null then
    select username into v_dono_alheio from cron.job
     where jobname = 'purge-cron-job-run-details' and username <> current_user limit 1;
    if v_dono_alheio is not null then
      raise exception 'cron_job_name_taken' using errcode = 'P0001',
        hint = format('job purge-cron-job-run-details pertence a %s', v_dono_alheio);
    end if;
    perform cron.schedule(
      'purge-cron-job-run-details',
      '29 3 * * *',
      'SELECT public.purge_cron_job_run_details(7)'
    );
    v_criados := array_append(v_criados, 'purge-cron-job-run-details');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '29 3 * * *',
      command := 'SELECT public.purge_cron_job_run_details(7)'
    );
    v_alterados := array_append(v_alterados, 'purge-cron-job-run-details');
  end if;

  return jsonb_build_object('criados', to_jsonb(v_criados), 'alterados', to_jsonb(v_alterados));
end;
$function$;


-- ============================================================================
-- 7) ACL: RPC do relatorio so para service_role; manutencao so pelo cron (dono)
-- ============================================================================
revoke all on function public.next_report_send_at(text, timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_scheduled_reports(integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_reports(integer) to service_role;

revoke all on function public.purge_cron_job_run_details(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.zapp_purge_crm_sync_outbox(integer, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.zapp_purge_ai_rate_limits(integer) from public, anon, authenticated, service_role;
revoke all on function public.apply_zapp_agendadores_e_purga_cron() from public, anon, authenticated, service_role;


-- ============================================================================
-- 8) Aplica (idempotente)
-- ============================================================================
select public.apply_zapp_agendadores_e_purga_cron() as agendadores;


-- ============================================================================
-- 9) Guarda de saida: os seis jobs existem, com a cadencia esperada, do dono atual
-- ============================================================================
do $guarda$
declare
  v_faltando text;
begin
  select string_agg(esperado.jobname, ', ') into v_faltando
    from (values
      ('auto-close-conversations',   '4-59/10 * * * *'),
      ('send-scheduled-report',      '9-59/15 * * * *'),
      ('cleanup-rate-limit-logs',    '14 4 * * *'),
      ('purge-crm-sync-outbox',      '19 4 * * *'),
      ('purge-ai-rate-limits',       '24 4 * * *'),
      ('purge-cron-job-run-details', '29 3 * * *')
    ) as esperado(jobname, schedule)
   where not exists (
     select 1 from cron.job as j
      where j.jobname = esperado.jobname
        and j.username = current_user
        and j.schedule = esperado.schedule
   );

  if v_faltando is not null then
    raise exception 'agendadores_ausentes_apos_apply' using errcode = 'P0001',
      hint = format('jobs sem cadencia esperada: %s', v_faltando);
  end if;
end
$guarda$;
