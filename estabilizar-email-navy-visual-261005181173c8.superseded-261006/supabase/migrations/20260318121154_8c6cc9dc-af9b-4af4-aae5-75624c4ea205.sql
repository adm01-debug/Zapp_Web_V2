
-- Fix: contacts INSERT - allow any authenticated user to create contacts but ensure proper assignment
DROP POLICY IF EXISTS "Users can insert contacts" ON public.contacts;
CREATE POLICY "Users can insert contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  );
