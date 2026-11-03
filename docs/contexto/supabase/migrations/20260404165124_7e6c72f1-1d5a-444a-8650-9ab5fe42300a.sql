-- 1. Fix conflicting audit_logs INSERT policies
DROP POLICY IF EXISTS "Only admins can insert audit logs" ON public.audit_logs;

-- 2. Fix team-chat-files SELECT policy
DROP POLICY IF EXISTS "Team chat files readable by authenticated users" ON storage.objects;

CREATE POLICY "Team chat files readable by owner or admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR is_admin_or_supervisor(auth.uid())
  )
);

-- 3. Create secure view for gmail_accounts hiding OAuth tokens
CREATE OR REPLACE VIEW public.gmail_accounts_safe AS
SELECT
  id,
  user_id,
  email_address,
  is_active,
  sync_status,
  last_sync_at,
  last_error,
  token_expires_at,
  created_at,
  updated_at
FROM public.gmail_accounts;

GRANT SELECT ON public.gmail_accounts_safe TO authenticated;
