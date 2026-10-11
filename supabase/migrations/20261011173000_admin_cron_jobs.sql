-- 20261011173000_admin_cron_jobs
-- Rollback: dropa as tres funcoes novas (a lista de permitidos e as duas RPCs); o estado dos jobs do pg_cron nao muda (a funcao so liga/desliga por chamada do admin, nao no DDL).
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_toggle_cron_job(text, boolean);
--   drop function if exists public.admin_list_cron_jobs();
--   drop function if exists public.admin_cron_jobs_permitidos();
--
-- admin_list_cron_jobs() e admin_toggle_cron_job(p_jobname, p_ativo): leitura da agenda, do
-- estado ativo e da ULTIMA execucao (cron.job_run_details) dos jobs do pg_cron da propria
-- aplicacao, e liga/desliga controlado com auditoria em public.audit_logs.
-- Paridade V3 -> V2 do painel admin (onda de paridade global, 11/10/2026).
--
-- Escopo: a lista de jobs TOCAVEIS e fixa (public.admin_cron_jobs_permitidos) e cobre so os
-- jobs que executam funcionalidade da aplicacao. Ficam FORA, de proposito:
--   * vacuum-contacts-daily e vacuum-messages-post-expurgo -> VACUUM do banco (manutencao
--     critica: parar acumula dead tuples e degrada o banco);
--   * cleanup-edge-rate-limits e cleanup-link-preview-cache -> limpeza de tabela/cache
--     (parar acumula lixo e incha as tabelas).
-- Pausar qualquer um desses nao e operacao de produto; por isso nao ha caminho para eles.
--
-- Classe: RPC de admin (SECURITY DEFINER + checagem interna) — aplicada pelo
-- hermes-db-migrar na copia de trabalho.

-- Lista unica dos jobs que o painel pode ver e ligar/desligar. Fonte da verdade dos dois
-- lados (listar e alternar), para nao haver deriva entre o que aparece e o que muda.
CREATE OR REPLACE FUNCTION public.admin_cron_jobs_permitidos()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'ai-jobs-tick-1min',
    'avatars-refresh',
    'connection-health-check',
    'expire-stale-agent-presence',
    'gmail-incremental-sync',
    'multiplix-send-trigger',
    'searchbox-budget-alert',
    'talkx-scheduler-1min',
    'tasks-notify-due'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
RETURNS TABLE (
  jobname             text,
  schedule            text,
  active              boolean,
  last_status         text,
  last_run_at         timestamptz,
  last_return_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_list_cron_jobs: acesso restrito a administradores'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT j.jobname::text,
         j.schedule::text,
         j.active,
         d.status,
         d.start_time,
         left(coalesce(d.return_message, ''), 200)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.status, r.start_time, r.return_message
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname = ANY (public.admin_cron_jobs_permitidos())
  ORDER BY j.jobname;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job(
  p_jobname text,
  p_ativo   boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $$
DECLARE
  v_jobid     bigint;
  v_antes     boolean;
  v_alterado  boolean := false;
  v_resultado boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_toggle_cron_job: acesso restrito a administradores'
      USING ERRCODE = '42501';
  END IF;

  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'admin_toggle_cron_job: p_ativo nao pode ser nulo'
      USING ERRCODE = '22023';
  END IF;

  -- Allow-list: job fora da lista (manutencao/limpeza ou desconhecido) nao e tocavel aqui.
  IF p_jobname IS NULL OR NOT (p_jobname = ANY (public.admin_cron_jobs_permitidos())) THEN
    RAISE EXCEPTION 'admin_toggle_cron_job: job "%" nao esta na lista de jobs da aplicacao',
      coalesce(p_jobname, '(nulo)')
      USING ERRCODE = '22023';
  END IF;

  -- So o job do dono atual: o indice unico do pg_cron e (jobname, username). Homonimo de
  -- outro dono nao e alcancado (nem por engano ligado/desligado) e cai no "nao encontrado".
  SELECT j.jobid, j.active INTO v_jobid, v_antes
  FROM cron.job j
  WHERE j.jobname = p_jobname
    AND j.username = current_user
  ORDER BY j.jobid
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'admin_toggle_cron_job: job "%" nao encontrado', p_jobname
      USING ERRCODE = '22023';
  END IF;

  -- Idempotente: se ja esta no estado pedido, nao reescreve o job (nao gera UPDATE no
  -- cron.job nem muda nada). Senao altera NO LUGAR, preservando jobid e historico.
  IF v_antes IS DISTINCT FROM p_ativo THEN
    v_resultado := cron.alter_job(job_id := v_jobid, active := p_ativo);
    IF v_resultado IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'admin_toggle_cron_job: pg_cron nao confirmou a alteracao do job "%"', p_jobname
        USING ERRCODE = '22023';
    END IF;
    v_alterado := true;
  END IF;

  -- Auditoria na MESMA transacao do alter_job: se este insert falhar, a alteracao do
  -- pg_cron tambem volta atras. Sem PII: so o nome do job e os estados.
  INSERT INTO public.audit_logs (user_id, action, entity_type, details)
  VALUES (
    auth.uid(),
    'admin_cron_job_toggle',
    'cron_job',
    jsonb_build_object(
      'jobname', p_jobname,
      'ativo_antes', v_antes,
      'ativo_depois', p_ativo,
      'alterado', v_alterado
    )
  );

  RETURN jsonb_build_object(
    'jobname', p_jobname,
    'ativo', p_ativo,
    'ativo_antes', v_antes,
    'alterado', v_alterado
  );
END;
$$;

-- ACL: nega por padrao. O default do Supabase concede EXECUTE a service_role em funcao nova
-- em public, entao service_role entra no REVOKE (o painel chama com JWT authenticated).
REVOKE ALL ON FUNCTION public.admin_cron_jobs_permitidos()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_cron_jobs()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_toggle_cron_job(text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_cron_job(text, boolean) TO authenticated;
