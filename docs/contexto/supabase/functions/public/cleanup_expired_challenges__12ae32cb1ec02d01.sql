CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Apenas service_role (webauthn edge) e postgres (cron) podem executar.
  -- Qualquer JWT authenticated bloqueado — não existe call site no front.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_expired_challenges: operacao restrita a service_role';
  END IF;
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$
