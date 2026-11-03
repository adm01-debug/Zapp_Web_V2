CREATE OR REPLACE FUNCTION public.log_login_block(p_email text, p_ip text, p_country_code text, p_reason text, p_user_agent text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
  v_email text;
  v_country text;
  v_ip text;
  v_ua text;
BEGIN
  v_reason := left(lower(btrim(coalesce(p_reason, ''))), 64);
  IF v_reason = '' THEN
    v_reason := 'unknown';
  END IF;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_country := left(nullif(upper(btrim(coalesce(p_country_code, ''))), ''), 8);
  v_ip := left(nullif(btrim(coalesce(p_ip, '')), ''), 64);
  v_ua := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
  VALUES (
    NULL,
    'login_blocked',
    'login',
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'email', v_email,
      'country_code', v_country,
      'reason', v_reason
    )),
    v_ip,
    v_ua
  );
END;
$function$
