DROP POLICY IF EXISTS "Admins can update conversation members" ON public.team_conversation_members;

CREATE POLICY "Members can update own row admins can update any" ON public.team_conversation_members FOR UPDATE USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()));
