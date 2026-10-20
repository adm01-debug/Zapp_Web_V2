-- Allow admins to delete stale password reset requests
CREATE POLICY "Admins can delete password reset requests"
ON public.password_reset_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Ensure contacts with null assigned_to are visible to admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts' AND policyname = 'Admins can view all contacts including unassigned'
  ) THEN
    CREATE POLICY "Admins can view all contacts including unassigned"
    ON public.contacts
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;