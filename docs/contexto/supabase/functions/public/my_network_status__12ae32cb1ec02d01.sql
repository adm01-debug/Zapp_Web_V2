CREATE OR REPLACE FUNCTION public.my_network_status()
 RETURNS TABLE(country text, ip_seen text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_headers jsonb;
  v_country text;
  v_ip text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'my_network_status: acesso negado' USING ERRCODE = '42501';
  END IF;
  v_headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_country := upper(btrim(coalesce(v_headers->>'cf-ipcountry','')));
  IF v_country !~ '^[A-Z]{2}$' THEN v_country := null; END IF;
  v_ip := nullif(btrim(regexp_replace(coalesce(v_headers->>'x-forwarded-for',''),'.*,','')), '');
  IF v_ip IS NULL THEN v_ip := nullif(btrim(coalesce(v_headers->>'x-real-ip','')), ''); END IF;
  IF v_ip IS NULL THEN v_ip := 'unknown'; END IF;
  RETURN QUERY SELECT v_country, v_ip;
END;
$function$
