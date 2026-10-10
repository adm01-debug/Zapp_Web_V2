-- 1. Fix team-chat-files
DROP POLICY IF EXISTS "Team chat files are publicly accessible" ON storage.objects;
CREATE POLICY "Team chat files readable by authenticated users"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'team-chat-files');

-- 2. Fix gmail_accounts: change from public to authenticated
DROP POLICY IF EXISTS "Only admins can insert gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Only admins can update gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Only admins can delete gmail accounts" ON public.gmail_accounts;

CREATE POLICY "Admins can insert gmail accounts" ON public.gmail_accounts FOR INSERT TO authenticated
WITH CHECK (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can update gmail accounts" ON public.gmail_accounts FOR UPDATE TO authenticated
USING (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete gmail accounts" ON public.gmail_accounts FOR DELETE TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- 3. Fix audit_logs: remove user INSERT
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

-- 4. Fix avatars: remove permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;