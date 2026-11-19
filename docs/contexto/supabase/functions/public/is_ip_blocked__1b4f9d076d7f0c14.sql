CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$function$
