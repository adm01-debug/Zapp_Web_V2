-- talkx_cron_runs_gate
-- Rollback: CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs(p_limit integer DEFAULT 60) RETURNS TABLE(runid bigint, jobid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_jobid bigint; v_limit integer; BEGIN v_limit := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200); IF to_regclass('cron.job') IS NOT NULL THEN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''talkx-scheduler-1min'' LIMIT 1' INTO v_jobid; END IF; IF v_jobid IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN RETURN; END IF; RETURN QUERY EXECUTE format('SELECT runid, jobid, status, return_message, start_time, end_time FROM cron.job_run_details WHERE jobid = %L ORDER BY start_time DESC NULLS LAST, runid DESC LIMIT %s', v_jobid, v_limit); END; $function$; REVOKE ALL ON FUNCTION public.talkx_engine_cron_runs(integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.talkx_engine_cron_runs(integer) TO authenticated, service_role;

-- R3-SEC-001 (item 118, M-DB-03): talkx_engine_cron_runs era SECURITY DEFINER com
-- GRANT EXECUTE para authenticated e SEM checar papel no corpo. O gate de papel
-- (admin/supervisor ou service_role) existia so no ramo cron da view
-- public.talkx_engine_health; qualquer authenticated podia chamar a RPC direto e
-- ler status/return_message das execucoes do job "talkx-scheduler-1min" com os
-- privilegios do dono (SECURITY DEFINER le cron.job_run_details). A autorizacao
-- nao pode depender de o cliente escolher consultar a view.
--
-- Correcao: mesmo contrato do helper irmao public.talkx_campaign_logs (mesma
-- migration X033): admin/supervisor (is_admin_or_supervisor) ou service_role;
-- quem nao for, recebe 42501 talkx_admin_required. ACL segue igual (o caminho
-- admin/supervisor e authenticated, entao o EXECUTE para authenticated fica).
--
-- Chamadores internos seguem passando: talkx_engine_alerts() exige
-- auth.role() = 'service_role' antes de usar o helper, e o ramo cron da view
-- talkx_engine_health ja filtra pelo mesmo predicado (o Postgres avalia o filtro
-- como one-time filter e nao chama o helper para quem nao passa). O teste
-- scripts/db-audit/talkx-engine-cron-runs-gate.test.sh prova os dois.

-- Marcador interno (sobrevive ao rename de --nova): talkx_cron_runs_role_gate
CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs(p_limit integer DEFAULT 60)
RETURNS TABLE(
  runid bigint,
  jobid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_jobid bigint;
  v_limit integer;
BEGIN
  -- R3-SEC-001: o helper age como o dono (le cron.job_run_details); sem esta
  -- checagem, authenticated comum alcancava os metadados do job do Talk X.
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''talkx-scheduler-1min'' LIMIT 1' INTO v_jobid;
  END IF;
  IF v_jobid IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT runid, jobid, status, return_message, start_time, end_time
       FROM cron.job_run_details
      WHERE jobid = %L
      ORDER BY start_time DESC NULLS LAST, runid DESC
      LIMIT %s', v_jobid, v_limit);
END;
$function$;

-- ACL reafirmada pela assinatura exata: nada de EXECUTE para PUBLIC/anon; o
-- caminho admin/supervisor e authenticated, entao ele segue com EXECUTE.
REVOKE ALL ON FUNCTION public.talkx_engine_cron_runs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_engine_cron_runs(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_engine_cron_runs(integer) IS
  'X033+R3-SEC-001: ultimas N execucoes do job cron talkx-scheduler-1min (status + return_message). So admin/supervisor ou service_role (42501 talkx_admin_required). Devolve vazio quando pg_cron/cron.job_run_details nao existem (Postgres descartavel).';
