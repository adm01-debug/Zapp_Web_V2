CREATE POLICY service_role_full ON public.webhook_failures AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)
