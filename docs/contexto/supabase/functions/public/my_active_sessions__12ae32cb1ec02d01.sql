CREATE OR REPLACE FUNCTION public.my_active_sessions()
 RETURNS TABLE(id uuid, device_id uuid, ip_address text, user_agent text, started_at timestamp with time zone, last_activity_at timestamp with time zone, auth_session_id uuid, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    us.id,
    us.device_id,
    us.ip_address,
    us.user_agent,
    us.started_at,
    us.last_activity_at,
    us.auth_session_id,
    COALESCE(
      us.auth_session_id IS NOT NULL
        AND us.auth_session_id = NULLIF(
              COALESCE(
                NULLIF(current_setting('request.jwt.claim.session_id', true), ''),
                current_setting('request.jwt.claims', true)::jsonb ->> 'session_id'
              ), ''
            )::uuid,
      false
    ) AS is_current
  FROM public.user_sessions AS us
  JOIN auth.sessions AS s
    ON s.id = us.auth_session_id
   AND s.user_id = us.user_id
   AND (s.not_after IS NULL OR s.not_after > now())
  WHERE us.user_id = auth.uid()
    AND us.is_active IS TRUE
  ORDER BY us.last_activity_at DESC NULLS LAST;
$function$
