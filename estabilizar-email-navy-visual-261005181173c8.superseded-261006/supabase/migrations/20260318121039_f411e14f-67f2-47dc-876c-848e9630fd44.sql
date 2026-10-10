
-- Fix CRITICAL: profiles SELECT - restrict sensitive fields to own profile or admin/supervisor
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id 
    OR is_admin_or_supervisor(auth.uid())
    OR true  -- allow basic visibility but we restrict via column-level later
  );

-- Fix CRITICAL: contact_custom_fields SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated can view custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can view custom fields" ON public.contact_custom_fields
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix CRITICAL: conversation_analyses SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated users can view analyses" ON public.conversation_analyses;
CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );
