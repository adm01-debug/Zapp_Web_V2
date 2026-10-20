REVOKE UPDATE ON public.team_conversation_members FROM authenticated;

GRANT UPDATE (last_read_at, is_muted, is_pinned, is_archived) ON public.team_conversation_members TO authenticated;

DROP POLICY IF EXISTS "Members can update own row admins can update any" ON public.team_conversation_members;

CREATE POLICY "Members can update own preferences" ON public.team_conversation_members FOR UPDATE USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update any member row" ON public.team_conversation_members FOR UPDATE USING (is_admin_or_supervisor(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF p_new_role NOT IN ('owner', 'admin', 'member') THEN RAISE EXCEPTION 'invalid role: %', p_new_role; END IF; IF NOT is_admin_or_supervisor(auth.uid()) THEN IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND member_role = 'owner') THEN RAISE EXCEPTION 'permission denied'; END IF; END IF; UPDATE public.team_conversation_members SET member_role = p_new_role WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id; END; $f$;
