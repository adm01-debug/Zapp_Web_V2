CREATE OR REPLACE FUNCTION public.apply_zapp_cron_secrets_l5()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, vault
AS $$
DECLARE
  v_health  text;
  v_avatars text;
  v_jobid   bigint;
  v_intruso text;
BEGIN
  SELECT decrypted_secret INTO v_health
    FROM vault.decrypted_secrets WHERE name = 'connection_health_check_cron_secret';
  SELECT decrypted_secret INTO v_avatars
    FROM vault.decrypted_secrets WHERE name = 'avatars_refresh_cron_secret';

  -- E5.3: presenca nao basta -- formato conferido para nao reagendar job com
  -- credencial vazia/truncada e so descobrir no 401 do proximo tick.
  IF v_health IS NULL OR v_health !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'cron_secret_l5: connection_health_check_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres)'
      USING HINT = 'O segredo e criado por 20260930240000_cron_secret_dedicado_l5. Se existe vazio ou truncado, rotacione antes de reagendar (docs/runbooks/cron-secret-rotation.md).';
  END IF;
  IF v_avatars IS NULL OR v_avatars !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'cron_secret_l5: avatars_refresh_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres)'
      USING HINT = 'O segredo e criado por 20260930240000_cron_secret_dedicado_l5. Se existe vazio ou truncado, rotacione antes de reagendar (docs/runbooks/cron-secret-rotation.md).';
  END IF;

  -- ── guarda de dono (E3.2), para os dois jobs ────────────────────────────────
  -- Um homonimo de outro dono nao e alcancavel daqui (cron.job e de supabase_admin e
  -- DML direto da 42501). Silenciar isso e o que produzia dois jobs ativos: melhor
  -- falhar alto e entregar o comando de correcao.
  SELECT string_agg(DISTINCT username, ', ') INTO v_intruso
    FROM cron.job
   WHERE jobname IN ('connection-health-check', 'avatars-refresh')
     AND username <> current_user;
  IF v_intruso IS NOT NULL THEN
    RAISE EXCEPTION 'cron_secret_l5: existe job (connection-health-check/avatars-refresh) de outro dono: %', v_intruso
      USING HINT = 'Como supabase_admin: SELECT jobid, jobname, username FROM cron.job WHERE username <> current_user; e depois SELECT cron.unschedule(jobid); para cada um. Enquanto isso o agendamento fica duplicado (dois jobs ativos com o mesmo nome).';
  END IF;

  -- ── connection-health-check (de */5 min, timeout 30s) ────────────────────────
  -- Estado anormal entre jobs NOSSOS: fica o de menor jobid. cron.unschedule(jobid)
  -- e o caminho permitido (resolve o dono por dentro do pg_cron).
  FOR v_jobid IN
    SELECT jobid FROM cron.job
     WHERE jobname = 'connection-health-check'
       AND jobid <> (SELECT min(jobid) FROM cron.job WHERE jobname = 'connection-health-check')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'connection-health-check';
  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'connection-health-check',
      '*/5 * * * *',
      $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='connection_health_check_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $cmd$
    );
  ELSE
    -- E4.2: alter_job muda so o que foi passado -- jobid e active ficam como estavam.
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '*/5 * * * *',
      command  := $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='connection_health_check_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $cmd$
    );
  END IF;

  -- ── avatars-refresh (de hora em hora, timeout 150s) ─────────────────────────
  FOR v_jobid IN
    SELECT jobid FROM cron.job
     WHERE jobname = 'avatars-refresh'
       AND jobid <> (SELECT min(jobid) FROM cron.job WHERE jobname = 'avatars-refresh')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'avatars-refresh';
  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'avatars-refresh',
      '0 * * * *',
      $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='avatars_refresh_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$
    );
  ELSE
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '0 * * * *',
      command  := $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='avatars_refresh_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_zapp_cron_secrets_l5()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT public.apply_zapp_cron_secrets_l5();
