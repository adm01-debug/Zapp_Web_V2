
-- Fix login_attempts: drop INSERT for authenticated, only service_role should insert
DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Authenticated insert login attempts" ON public.login_attempts;
-- Only service_role (used by Edge Functions) should insert login attempts
-- The existing policies from RLS default deny will handle this

-- Fix whatsapp-media: remove OR true
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
CREATE POLICY "Users can read whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
);

-- Fix audit_logs INSERT: ensure user_id matches
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit_logs" ON public.audit_logs;

CREATE POLICY "Users can insert own audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Remove campaign_contacts from Realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_contacts;
