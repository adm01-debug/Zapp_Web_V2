
-- 1. Notifications: remove authenticated INSERT (server-only writes)
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

-- Block authenticated INSERT explicitly
CREATE POLICY "Block authenticated notification inserts"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2. Entity versions: remove authenticated INSERT (trigger-only writes)
DROP POLICY IF EXISTS "Authenticated can insert versions" ON public.entity_versions;

CREATE POLICY "Block authenticated version inserts"
ON public.entity_versions
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 3. Warroom alerts: restrict to admins/supervisors only
DROP POLICY IF EXISTS "All authenticated users can view alerts" ON public.warroom_alerts;
-- Keep the "Admins can view warroom alerts" policy
