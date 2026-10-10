
-- 1. Remove the broad public INSERT policy on team_conversation_members
DROP POLICY IF EXISTS "Authenticated users can add members" ON public.team_conversation_members;

-- Also remove duplicate DELETE policies
DROP POLICY IF EXISTS "Members can leave conversations" ON public.team_conversation_members;

-- Also remove duplicate UPDATE policy (keep admin one)
DROP POLICY IF EXISTS "Members can update own membership" ON public.team_conversation_members;

-- 2. Gmail accounts: ensure no authenticated SELECT exists
-- The service_role ALL policy handles everything. Drop any leftover authenticated policies.
DROP POLICY IF EXISTS "Admins can delete gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Admins can insert gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Admins can update gmail accounts" ON public.gmail_accounts;

-- 3. Agent stats: restrict UPDATE to admins/supervisors only
DROP POLICY IF EXISTS "Users can update their own stats" ON public.agent_stats;

CREATE POLICY "Only admins can update agent stats"
ON public.agent_stats
FOR UPDATE
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 4. NPS surveys: require non-null agent_id matching the authenticated user
DROP POLICY IF EXISTS "Authenticated users can create NPS surveys" ON public.nps_surveys;

CREATE POLICY "Users can create own NPS surveys"
ON public.nps_surveys
FOR INSERT
TO authenticated
WITH CHECK (
  agent_id IS NOT NULL
  AND agent_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);
