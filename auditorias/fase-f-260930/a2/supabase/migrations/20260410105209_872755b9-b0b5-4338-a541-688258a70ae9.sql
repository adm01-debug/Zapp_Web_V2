
-- 3. Create safe view for whatsapp_connections (no qr_code, no instance_id for non-admins)
CREATE OR REPLACE VIEW public.whatsapp_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, name, phone_number, status, is_default,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN qr_code ELSE NULL END AS qr_code,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN instance_id ELSE NULL END AS instance_id,
  farewell_message, farewell_enabled, battery_level, is_plugged,
  retry_count, max_retries, last_health_check, health_status, health_response_ms,
  created_by, created_at, updated_at
FROM public.whatsapp_connections;

-- 4. Rate-limit password reset requests (max 3 pending per user per hour)
CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_reset ON public.password_reset_requests;
CREATE TRIGGER trg_rate_limit_reset
  BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_reset_requests();
