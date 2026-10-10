-- N-011: drop duplicate avatar DELETE policy (plural "avatars" duplicates singular "avatar")
-- Rollback: recria a policy removida com a mesma assinatura e USING clause originais.
-- Rollback (SQL executavel, na ordem):
--   CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;