-- Create the visibility grants table
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(agent_id, can_see_agent_id)
);

ALTER TABLE public.agent_visibility_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can manage visibility grants"
  ON public.agent_visibility_grants
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Special agents can view own grants"
  ON public.agent_visibility_grants
  FOR SELECT
  TO authenticated
  USING (
    agent_id IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- Helper function to get all visible profile IDs for a user
CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
  UNION
  SELECT avg.can_see_agent_id
  FROM public.agent_visibility_grants avg
  JOIN public.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'special_agent'
    )
$$;

-- Update contacts SELECT policy
DROP POLICY IF EXISTS "Users can view their assigned contacts" ON public.contacts;
CREATE POLICY "Users can view their assigned contacts"
  ON public.contacts FOR SELECT TO authenticated
  USING (
    assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Update contacts UPDATE policy
DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public.contacts;
CREATE POLICY "Users can update their assigned contacts"
  ON public.contacts FOR UPDATE TO authenticated
  USING (
    assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Update messages SELECT policy
DROP POLICY IF EXISTS "Users can view messages from their assigned contacts" ON public.messages;
CREATE POLICY "Users can view messages from their assigned contacts"
  ON public.messages FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Update messages UPDATE policy
DROP POLICY IF EXISTS "Users can update messages from their assigned contacts" ON public.messages;
CREATE POLICY "Users can update messages from their assigned contacts"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );
