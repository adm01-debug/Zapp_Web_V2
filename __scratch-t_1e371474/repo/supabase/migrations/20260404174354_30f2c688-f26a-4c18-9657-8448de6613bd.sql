
-- 1. Audit logs: block DELETE and UPDATE
CREATE POLICY "Block authenticated deletes on audit_logs"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "Block authenticated updates on audit_logs"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

-- 2. Rate limit logs: allow service_role inserts (it bypasses RLS anyway)
-- But also keep admin insert for manual entries
-- No change needed - service_role bypasses RLS automatically

-- 3. WhatsApp QR: auto-clear after connection
CREATE OR REPLACE FUNCTION public.clear_qr_on_connect()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_qr_on_connect_trigger ON public.whatsapp_connections;
CREATE TRIGGER clear_qr_on_connect_trigger
BEFORE UPDATE OF status ON public.whatsapp_connections
FOR EACH ROW
EXECUTE FUNCTION public.clear_qr_on_connect();
