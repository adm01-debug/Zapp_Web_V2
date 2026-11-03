CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job(p_jobname text, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'cron'
AS $function$
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
$function$
