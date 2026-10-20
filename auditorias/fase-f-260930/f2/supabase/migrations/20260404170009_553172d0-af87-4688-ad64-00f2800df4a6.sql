-- 1. Fix password_reset_requests: users should NOT see their own reset_token
DROP POLICY IF EXISTS "Admins can view reset requests without tokens" ON public.password_reset_requests;

-- Admins can view all reset requests (including token for processing)
CREATE POLICY "Admins can view all reset requests"
ON public.password_reset_requests FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Users can only view their requests via the safe view (no token)
-- No direct SELECT policy for regular users on base table

-- 2. Fix team-chat-files: restrict upload to own folder
DROP POLICY IF EXISTS "Authenticated users can upload team chat files" ON storage.objects;

CREATE POLICY "Users can upload to own folder in team-chat-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'team-chat-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Add DELETE policy for warroom_alerts
CREATE POLICY "Admins can delete warroom alerts"
ON public.warroom_alerts FOR DELETE
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- 4. Fix message_reactions: remove overly permissive INSERT
DROP POLICY IF EXISTS "Authenticated users can add reactions" ON public.message_reactions;
