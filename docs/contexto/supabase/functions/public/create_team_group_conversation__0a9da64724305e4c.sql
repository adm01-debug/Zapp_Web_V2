CREATE OR REPLACE FUNCTION public.create_team_group_conversation(p_name text DEFAULT NULL::text, p_member_ids uuid[] DEFAULT ARRAY[]::uuid[], p_department_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_conv_id    uuid;
  v_type       text;
  v_member     uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_type := CASE WHEN p_department_id IS NULL THEN 'group' ELSE 'department' END;

  IF v_type = 'group' AND NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'group_name_required';
  END IF;

  IF v_type = 'department' THEN
    IF NOT public.is_admin_or_supervisor(auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = v_profile_id AND p.department_id = p_department_id
       ) THEN
      RAISE EXCEPTION 'department_membership_required';
    END IF;

    -- get-or-create: uma conversa por departamento (idx_team_conversations_dept_unique).
    -- Retorna sem mexer nos membros: quem não é membro continua sem ver a conversa.
    SELECT tc.id INTO v_conv_id
      FROM public.team_conversations tc
     WHERE tc.type = 'department' AND tc.department_id = p_department_id;
    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  END IF;

  INSERT INTO public.team_conversations (type, name, created_by, department_id)
  VALUES (v_type, NULLIF(btrim(COALESCE(p_name, '')), ''), v_profile_id, p_department_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
  VALUES (v_conv_id, v_profile_id, 'owner');

  FOREACH v_member IN ARRAY p_member_ids LOOP
    IF v_member IS NOT NULL AND v_member <> v_profile_id THEN
      INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
      VALUES (v_conv_id, v_member, 'member')
      ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_conv_id;
END;
$function$
