
-- Fix team-chat-files DELETE policy to use authenticated role instead of public
DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;

CREATE POLICY "Users can delete own team chat files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add INSERT/UPDATE/DELETE policies for blocked_ips (admin-only)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert blocked IPs' AND tablename = 'blocked_ips') THEN
    CREATE POLICY "Admins can insert blocked IPs"
    ON public.blocked_ips
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update blocked IPs' AND tablename = 'blocked_ips') THEN
    CREATE POLICY "Admins can update blocked IPs"
    ON public.blocked_ips
    FOR UPDATE
    TO authenticated
    USING (public.is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete blocked IPs' AND tablename = 'blocked_ips') THEN
    CREATE POLICY "Admins can delete blocked IPs"
    ON public.blocked_ips
    FOR DELETE
    TO authenticated
    USING (public.is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;
