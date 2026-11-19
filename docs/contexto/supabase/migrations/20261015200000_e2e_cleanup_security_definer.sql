CREATE OR REPLACE FUNCTION public.e2e_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM 'aaa9b766-3b72-403d-95ad-f9cd7301ebca'::uuid THEN
    RAISE EXCEPTION 'e2e_cleanup: caller nao autorizado';
  END IF;

  DELETE FROM public.conversation_closures
  WHERE contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759';

  DELETE FROM public.catalog_send_events
  WHERE contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759';
END;
$$

REVOKE ALL ON FUNCTION public.e2e_cleanup() FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.e2e_cleanup() TO authenticated
