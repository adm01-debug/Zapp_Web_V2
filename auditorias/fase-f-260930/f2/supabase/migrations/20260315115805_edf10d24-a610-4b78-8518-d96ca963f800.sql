
-- 1. FIX: webauthn_challenges - restrict to authenticated users owning the challenge
DROP POLICY IF EXISTS "Service can manage challenges" ON public.webauthn_challenges;
CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (true);

-- 2. FIX: login_attempts - remove public access, managed via security definer functions only
DROP POLICY IF EXISTS "System can manage login attempts" ON public.login_attempts;

-- 3. FIX: whatsapp_groups - drop all existing policies first
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'whatsapp_groups' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.whatsapp_groups', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage whatsapp groups" ON public.whatsapp_groups FOR ALL TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 4. FIX: messages INSERT - restrict to authenticated only
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

-- 5. FIX: whatsapp_connections - remove unrestricted write policies that override admin policy
DROP POLICY IF EXISTS "Authenticated users can delete connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Authenticated users can insert connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Authenticated users can update connections" ON public.whatsapp_connections;

-- 6. FIX: notifications INSERT - restrict to authenticated
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
