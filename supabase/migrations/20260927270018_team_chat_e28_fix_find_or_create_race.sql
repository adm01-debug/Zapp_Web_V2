-- E28: Race-safe find_or_create_direct_conversation + E15 owner backfill

-- E15 backfill: ensure group-conversation creator carries member_role = 'owner'
UPDATE public.team_conversation_members tcm
   SET member_role = 'owner'
  FROM public.team_conversations tc
 WHERE tc.type = 'group'
   AND tc.created_by IS NOT NULL
   AND tcm.conversation_id = tc.id
   AND tcm.profile_id = tc.created_by
   AND tcm.member_role != 'owner';

-- Replace find_or_create_direct_conversation with a race-safe ON CONFLICT version
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(
  other_profile_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_profile_id uuid;
  p_a           uuid;
  p_b           uuid;
  conv_id       uuid;
BEGIN
  SELECT id INTO my_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF my_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot create direct conversation with yourself';
  END IF;

  -- Canonical ordering: smaller text representation goes to direct_member_a
  IF my_profile_id::text < other_profile_id::text THEN
    p_a := my_profile_id; p_b := other_profile_id;
  ELSE
    p_a := other_profile_id; p_b := my_profile_id;
  END IF;

  -- Fast path: conversation already exists
  SELECT id INTO conv_id
    FROM public.team_conversations
   WHERE type = 'direct'
     AND direct_member_a = p_a
     AND direct_member_b = p_b;
  IF conv_id IS NOT NULL THEN RETURN conv_id; END IF;

  -- Slow path: create conversation, tolerate concurrent inserts via ON CONFLICT
  INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
  VALUES ('direct', my_profile_id, p_a, p_b)
  ON CONFLICT DO NOTHING
  RETURNING id INTO conv_id;

  IF conv_id IS NULL THEN
    -- Lost the race -- another session created it simultaneously
    SELECT id INTO conv_id
      FROM public.team_conversations
     WHERE type = 'direct'
       AND direct_member_a = p_a
       AND direct_member_b = p_b;
  ELSE
    -- We won -- seed both members
    INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
    VALUES (conv_id, my_profile_id, 'owner'),
           (conv_id, other_profile_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN conv_id;
END; $$;
