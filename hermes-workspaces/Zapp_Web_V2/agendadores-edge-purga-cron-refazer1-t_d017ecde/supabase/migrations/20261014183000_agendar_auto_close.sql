-- agendar_auto_close
-- Rollback: desagenda o job auto-close-conversations (somente do dono atual) e remove a
-- funcao de aplicacao que esta migration adicionou, devolvendo a base ao estado de
-- 20261013093000 sem tocar em job de outro dono.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where username = current_user and jobname = 'auto-close-conversations';
--   drop function if exists public.apply_zapp_agendar_auto_close();
--
-- ============================================================================
-- Cartao: PK-02 -- agendar auto-close-conversations DEPOIS da correcao da Edge
-- ============================================================================
-- Dependencia (ordem obrigatoria)
-- ------------------------------
-- Este agendador SO pode existir depois do PK-01, que corrigiu a Edge
-- `auto-close-conversations` (lote de 200, filtro de status/exclusao e encerramento
-- pelo outbox oficial). Antes disso a Edge varria todo contato com `updated_at`
-- antigo, sem filtro de status/exclusao/limite: agenda-la a cada 10 min desatribuiria
-- milhares de contatos de uma vez. A Edge corrigida ja esta no workspace base desta
-- migration (commit `fix(edge): auto-fechamento por ultima mensagem, lote de 200 e
-- encerramento no outbox`), e `supabase/config.toml` ja traz
-- `[functions.auto-close-conversations] verify_jwt = false` -- sem isso o gateway
-- barra o cron com 401 antes do `x-cron-secret` (recusa PE-102, ponto 2).
--
-- Cadencia
-- --------
-- `4-59/10 * * * *` (a cada 10 min, no minuto 4): fecha conversas paradas, entao
-- 10 min e a cadencia acordada com o dono do cartao. Timeout 120 s, o mesmo dos
-- outros jobs de Edge.
--
-- Segredo
-- -------
-- O `CRON_SECRET` e UM valor compartilhado (runbook docs/runbooks/cron-secret-rotation.md):
-- a MESMA string vive no env da Edge e no Vault sob o nome historico `gmail_cron_secret`.
-- O job le o valor direto do Vault -- nunca escrevemos o segredo na migration -- e a Edge
-- confere `x-cron-secret` contra esse valor em tempo constante. Nao criamos segredo novo:
-- um valor aleatorio novo nao casaria com o env da Edge e o job tomaria 401.
--
-- Como o job roda
-- ---------------
--   * net.http_post para public.zapp_project_url() || '/functions/v1/auto-close-conversations'
--     com `x-cron-secret` e timeout > 0 (mesmo molde de 20260930250000 / PE-102). A URL base
--     nao fica literal no comando: vem de `public.zapp_project_url()` (PE-102), que resolve
--     `app.settings.supabase_url` e cai para o segredo `zapp_project_url` do Vault.
--   * Nenhum DML direto em cron.job: so `cron.schedule`/`cron.alter_job` (licao do 42501
--     de 20260930430000 -- cron.job pertence a supabase_admin).
--
-- Idempotencia
-- ------------
-- `apply_zapp_agendar_auto_close()` usa IF cron.job (mesmo nome + mesmo dono) entao
-- alter_job, senao cron.schedule. Reaplicar nao cria job duplicado nem toca job de outro
-- dono; nome homonimo de outro dono levanta `cron_job_name_taken` em vez de sobrescrever.
-- ============================================================================


-- ============================================================================
-- 1) Agendador versionado e idempotente
-- ============================================================================
create or replace function public.apply_zapp_agendar_auto_close()
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
  -- ---- auto-close-conversations (a cada 10 min, no minuto 4) ----
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
        url := public.zapp_project_url() || '/functions/v1/auto-close-conversations',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_criados := array_append(v_criados, 'auto-close-conversations');
  else
    perform cron.alter_job(
      v_jobid,
      schedule := '4-59/10 * * * *',
      command := $cmd$SELECT net.http_post(
        url := public.zapp_project_url() || '/functions/v1/auto-close-conversations',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='gmail_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id$cmd$
    );
    v_alterados := array_append(v_alterados, 'auto-close-conversations');
  end if;

  return jsonb_build_object('criados', to_jsonb(v_criados), 'alterados', to_jsonb(v_alterados));
end;
$function$;

comment on function public.apply_zapp_agendar_auto_close() is
  'PK-02: agenda (ou reajusta) o job auto-close-conversations de forma idempotente. '
  'Le x-cron-secret do Vault e a URL base de public.zapp_project_url(); nao cria segredo novo.';


-- ============================================================================
-- 2) ACL: o agendador e do cron (dono), nao de anon/authenticated/service_role
-- ============================================================================
revoke all on function public.apply_zapp_agendar_auto_close() from public, anon, authenticated, service_role;


-- ============================================================================
-- 3) Aplica (idempotente)
-- ============================================================================
select public.apply_zapp_agendar_auto_close() as agendador_auto_close;


-- ============================================================================
-- 4) Guarda de saida: o job existe, com a cadencia esperada, do dono atual e com o
--    header do cron -- senao a migration falha em vez de deixar a base pela metade.
-- ============================================================================
do $guarda$
declare
  v_erro text;
begin
  if not exists (
    select 1 from cron.job as j
     where j.jobname = 'auto-close-conversations'
       and j.username = current_user
       and j.schedule = '4-59/10 * * * *'
  ) then
    raise exception 'agendador_auto_close_ausente_apos_apply' using errcode = 'P0001',
      hint = 'o job auto-close-conversations nao ficou com a cadencia 4-59/10 * * * * do dono atual';
  end if;

  select string_agg(motivo, ', ') into v_erro
    from (
      select 'sem x-cron-secret' as motivo
       where not exists (select 1 from cron.job as j
        where j.jobname = 'auto-close-conversations'
          and j.username = current_user
          and j.command like '%x-cron-secret%')
      union all
      select 'sem o segredo do Vault (gmail_cron_secret)'
       where not exists (select 1 from cron.job as j
        where j.jobname = 'auto-close-conversations'
          and j.username = current_user
          and j.command like '%gmail_cron_secret%')
      union all
      select 'sem timeout'
       where not exists (select 1 from cron.job as j
        where j.jobname = 'auto-close-conversations'
          and j.username = current_user
          and j.command ~ 'timeout_milliseconds := [1-9]')
    ) as falhas;

  if v_erro is not null then
    raise exception 'agendador_auto_close_incompleto' using errcode = 'P0001',
      hint = format('job auto-close-conversations %s', v_erro);
  end if;
end
$guarda$;
