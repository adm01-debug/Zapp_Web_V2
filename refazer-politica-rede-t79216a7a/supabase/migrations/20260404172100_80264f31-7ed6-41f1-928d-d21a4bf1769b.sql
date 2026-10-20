
-- 1. Fix gmail_accounts: remove admin/supervisor SELECT policy, restrict to service_role only
DROP POLICY IF EXISTS "Only service role and admins can view gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Admins and supervisors can view gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Service role can manage gmail accounts" ON public.gmail_accounts;

-- Only service_role can access the raw gmail_accounts table
CREATE POLICY "Service role only for gmail accounts"
ON public.gmail_accounts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Fix team_conversation_members: restrict INSERT to existing members or admins
DROP POLICY IF EXISTS "Authenticated users can manage conversation members" ON public.team_conversation_members;
DROP POLICY IF EXISTS "Members can view conversation members" ON public.team_conversation_members;

-- SELECT: members of the conversation + admins/supervisors
CREATE POLICY "Members and admins can view conversation members"
ON public.team_conversation_members
FOR SELECT
TO authenticated
USING (
  public.is_team_conversation_member(auth.uid(), conversation_id)
  OR public.is_admin_or_supervisor(auth.uid())
);

-- INSERT: only existing members or admins can add new members
CREATE POLICY "Members and admins can add conversation members"
ON public.team_conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_team_conversation_member(auth.uid(), conversation_id)
  OR public.is_admin_or_supervisor(auth.uid())
);

-- UPDATE: admins/supervisors only
CREATE POLICY "Admins can update conversation members"
ON public.team_conversation_members
FOR UPDATE
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- DELETE: member can leave (own profile) or admins can remove
CREATE POLICY "Members can leave or admins can remove"
ON public.team_conversation_members
FOR DELETE
TO authenticated
USING (
  profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  OR public.is_admin_or_supervisor(auth.uid())
);
