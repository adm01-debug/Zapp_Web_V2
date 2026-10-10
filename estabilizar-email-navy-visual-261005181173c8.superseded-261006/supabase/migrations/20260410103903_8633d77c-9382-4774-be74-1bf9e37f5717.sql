
-- 1. Allow agents to insert conversation_events for contacts assigned to them
DROP POLICY IF EXISTS "Admins and supervisors can insert events" ON public.conversation_events;

CREATE POLICY "Authorized users can insert events"
ON public.conversation_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_supervisor(auth.uid())
  OR (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
  )
);

-- 2. Fix csat_surveys - make agent_id required for new inserts
-- First update any existing null agent_id rows (set to first admin profile as fallback)
UPDATE public.csat_surveys 
SET agent_id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
WHERE agent_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE public.csat_surveys ALTER COLUMN agent_id SET NOT NULL;
