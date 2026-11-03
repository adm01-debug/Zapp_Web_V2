CREATE OR REPLACE FUNCTION public.apply_pg_cron_escalonamento(p_reverter boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $fn$
DECLARE
  alvo       record;
  jid        bigint;
  qtd        integer;
  aplicados  integer := 0;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      -- job                          horario original   horario escalonado
      ('expire-stale-agent-presence', '*/2 * * * *',        '1-59/2 * * * *'),
      ('multiplix-send-trigger',      '*/2 * * * *',        '0-58/2 * * * *'),
      ('gmail-incremental-sync',      '*/5 * * * *',        '0-55/5 * * * *'),
      ('connection-health-check',     '*/5 * * * *',        '2-57/5 * * * *'),
      ('cleanup-edge-rate-limits',    '*/15 * * * *',       '7-52/15 * * * *'),
      ('avatars-refresh',             '0 * * * *',          '7 * * * *'),
      ('cleanup-link-preview-cache',  '0 3 * * *',          '12 3 * * *'),
      ('vacuum-contacts-daily',       '30 3 * * *',         '42 3 * * *'),
      ('vacuum-messages-post-expurgo','0 3 2 9 *',          '20 3 2 9 *')
    ) AS t(jobname, horario_original, horario_escalonado)
  LOOP
    SELECT count(*) INTO qtd FROM cron.job WHERE jobname = alvo.jobname;
    IF qtd <> 1 THEN
      RAISE EXCEPTION
        'job % esperado 1x em cron.job, encontrado % - escalonamento abortado sem aplicar nada',
        alvo.jobname, qtd;
    END IF;

    SELECT jobid INTO jid FROM cron.job WHERE jobname = alvo.jobname;
    PERFORM cron.alter_job(
      job_id   := jid,
      schedule := CASE WHEN p_reverter THEN alvo.horario_original
                       ELSE alvo.horario_escalonado END
    );
    aplicados := aplicados + 1;
  END LOOP;

  RETURN aplicados;
END;
$fn$

REVOKE ALL ON FUNCTION public.apply_pg_cron_escalonamento(boolean)
  FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.apply_pg_cron_escalonamento(boolean) TO service_role

SELECT public.apply_pg_cron_escalonamento(false)
