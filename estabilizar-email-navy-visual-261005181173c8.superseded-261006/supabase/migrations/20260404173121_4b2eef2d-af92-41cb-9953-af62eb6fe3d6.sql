
-- 1. Password reset: remove user self-access to prevent token exposure
DROP POLICY IF EXISTS "Only admins can view reset requests" ON public.password_reset_requests;

CREATE POLICY "Only admins can view reset requests"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Contacts: restrict unassigned insert to admins/supervisors
DROP POLICY IF EXISTS "Agents can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON public.contacts;

-- Check existing INSERT policies
DO $$ BEGIN
  -- Try to drop any INSERT policy
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can create contacts" ON public.contacts';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recreate: agents must assign to self, admins can leave unassigned
CREATE POLICY "Users can insert contacts"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (
  -- Admins/supervisors can insert freely
  public.is_admin_or_supervisor(auth.uid())
  -- Agents must assign to themselves
  OR (
    assigned_to IS NOT NULL
    AND assigned_to IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);
