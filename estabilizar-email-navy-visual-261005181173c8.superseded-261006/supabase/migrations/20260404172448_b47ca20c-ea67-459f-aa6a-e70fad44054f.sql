
-- 1. Restrict user_roles SELECT to own roles (admins see all via the ALL policy)
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view all roles (already covered by "Only admins can manage roles" ALL policy,
-- but add explicit SELECT for clarity)
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Team chat files: admin/supervisor DELETE
CREATE POLICY "Admins can delete team chat files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'team-chat-files'
  AND public.is_admin_or_supervisor(auth.uid())
);
