
-- Fix views with security_invoker to inherit RLS from base tables
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, user_id, name, avatar_url, is_active, department, job_title
FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated;

DROP VIEW IF EXISTS public.whatsapp_connections_public;
CREATE VIEW public.whatsapp_connections_public
WITH (security_invoker = true) AS
SELECT id, name, phone_number, status, is_default
FROM public.whatsapp_connections;
GRANT SELECT ON public.whatsapp_connections_public TO authenticated;

-- Fix password_reset_requests SELECT: AND → OR
DROP POLICY IF EXISTS "Users can view own reset requests safe" ON public.password_reset_requests;
CREATE POLICY "Users can view own reset requests"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()));

-- Add audio-messages DELETE + UPDATE policies
CREATE POLICY "Users can delete own audio messages"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can update own audio messages"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

-- Fix whatsapp-media SELECT with contact ownership
DROP POLICY IF EXISTS "Authenticated read whatsapp media" ON storage.objects;
CREATE POLICY "Users can read assigned whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR true  -- WhatsApp media needs to be accessible for message display; Evolution API also accesses these URLs
  )
);
