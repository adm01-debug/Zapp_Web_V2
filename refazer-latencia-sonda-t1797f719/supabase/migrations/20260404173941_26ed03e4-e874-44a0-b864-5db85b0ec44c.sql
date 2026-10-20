
-- 1. Gmail: user-scoped SELECT
DROP POLICY IF EXISTS "Authenticated users cannot read gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Users can view own gmail accounts" ON public.gmail_accounts;

CREATE POLICY "Users can view own gmail accounts"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Connection health logs: INSERT for admins
DROP POLICY IF EXISTS "Admins can insert health logs" ON public.connection_health_logs;

CREATE POLICY "Admins can insert health logs"
ON public.connection_health_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 3. Webhook rate limits: UPDATE for admins
CREATE POLICY "Admins can update rate limits"
ON public.webhook_rate_limits
FOR UPDATE
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));
