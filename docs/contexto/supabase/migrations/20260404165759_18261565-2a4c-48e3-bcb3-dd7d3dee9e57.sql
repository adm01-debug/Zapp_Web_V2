-- Fix DELETE policy for whatsapp-media bucket
-- Current policy only checks auth.uid() folder match, missing contact assignment check
DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;

CREATE POLICY "Users can delete their own or assigned media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
