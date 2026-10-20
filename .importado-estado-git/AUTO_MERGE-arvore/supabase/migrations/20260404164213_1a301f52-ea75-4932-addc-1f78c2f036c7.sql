-- Fix: restrict avatar deletion to file owner only
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;

CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Fix: restrict audit_logs INSERT to service role only (block authenticated users)
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "Block authenticated inserts on audit_logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (false);