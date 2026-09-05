-- Hardening do lockout pós-#218 (achados Copilot/cubic validados contra o banco em 2026-09-05):
-- 1) record_failed_login: o UPSERT resetava attempt_count=1 sempre que locked_until estava
--    expirado, mas nunca limpava a coluna — toda falha seguinte caía de novo no reset e a
--    conta nunca voltava a travar. Agora: lock vigente => tentativa ignorada (sem estender o
--    lock, o que era vetor de DoS); lock expirado => limpa locked_until e segue contando
--    (escalada 2^(n-5) min preservada até 2^10); sucesso continua limpando via clear_login_attempts.
-- 2) authenticated ainda tinha EXECUTE em record_failed_login: qualquer usuário logado podia
--    travar qualquer e-mail via RPC direto. A edge record-failed-login usa service_role.
-- 3) calculate_level e normalize_contact_phone mantinham EXECUTE para PUBLIC (proacl "=X/postgres"),
--    o que tornava os REVOKEs de 20260904330000 inócuos. Triggers seguem executando como owner.
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_count INTEGER;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts CONSTANT INTEGER := 5;
BEGIN
  INSERT INTO public.login_attempts AS la (email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at)
  VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1, now(), now())
  ON CONFLICT (email) DO UPDATE
    SET attempt_count = CASE
          WHEN la.locked_until IS NOT NULL AND la.locked_until > now() THEN la.attempt_count
          ELSE LEAST(la.attempt_count + 1, 10000)
        END,
        locked_until = CASE
          WHEN la.locked_until IS NOT NULL AND la.locked_until <= now() THEN NULL
          ELSE la.locked_until
        END,
        last_attempt_at = now(),
        ip_address = COALESCE(EXCLUDED.ip_address, la.ip_address),
        user_agent = COALESCE(EXCLUDED.user_agent, la.user_agent),
        updated_at = now()
  RETURNING la.attempt_count, la.locked_until INTO v_new_count, v_locked_until;

  IF v_locked_until IS NULL AND v_new_count >= v_max_attempts THEN
    v_locked_until := now() + (POWER(2, LEAST(v_new_count - v_max_attempts, 10))::INTEGER * INTERVAL '1 minute');
    UPDATE public.login_attempts
    SET locked_until = v_locked_until, updated_at = now()
    WHERE email = LOWER(p_email);
  END IF;

  RETURN QUERY SELECT
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.calculate_level(integer) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM PUBLIC;
