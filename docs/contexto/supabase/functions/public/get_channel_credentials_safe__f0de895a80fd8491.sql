CREATE OR REPLACE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only admins can access credentials
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  
  RETURN (
    SELECT credentials 
    FROM public.channel_connections 
    WHERE id = p_channel_id
  );
END;
$function$
