CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_my_profile_id uuid;
  v_a uuid;
  v_b uuid;
  v_conv_id uuid;
BEGIN
  v_my_profile_id := public.current_profile_id();
  IF v_my_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF other_profile_id IS NULL THEN
    RAISE EXCEPTION 'other_profile_id_required';
  END IF;
  IF v_my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot_create_direct_with_self';
  END IF;

  -- Par ordenado canônico: é ele que o índice único parcial arbitra.
  IF v_my_profile_id::text < other_profile_id::text THEN
    v_a := v_my_profile_id;
    v_b := other_profile_id;
  ELSE
    v_a := other_profile_id;
    v_b := v_my_profile_id;
  END IF;

  -- 1) identidade canônica do par
  SELECT c.id INTO v_conv_id
    FROM public.team_conversations c
   WHERE c.type = 'direct'
     AND c.direct_member_a = v_a
     AND c.direct_member_b = v_b;

  -- 2) legado: linha direta criada sem o par gravado — acha pelos dois membros
  IF v_conv_id IS NULL THEN
    SELECT c.id INTO v_conv_id
      FROM public.team_conversations c
      JOIN public.team_conversation_members m1
        ON m1.conversation_id = c.id AND m1.profile_id = v_a
      JOIN public.team_conversation_members m2
        ON m2.conversation_id = c.id AND m2.profile_id = v_b
     WHERE c.type = 'direct'
     LIMIT 1;
  END IF;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- 3) UPSERT arbitrado pelo índice único do par: requisições concorrentes para o mesmo par
  --    NÃO criam duas conversas (o DO NOTHING espera o commit da transação que ganhou a corrida).
  INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
  VALUES ('direct', v_my_profile_id, v_a, v_b)
  ON CONFLICT (direct_member_a, direct_member_b) WHERE type = 'direct' DO NOTHING
  RETURNING id INTO v_conv_id;

  -- 4) perdemos a corrida: a linha do par já está commitada — relê o par (não depende de
  --    visibilidade de membership) e, se por algum motivo ela não tiver os membros, garante.
  IF v_conv_id IS NULL THEN
    SELECT c.id INTO v_conv_id
      FROM public.team_conversations c
     WHERE c.type = 'direct'
       AND c.direct_member_a = v_a
       AND c.direct_member_b = v_b;
  END IF;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'direct_conversation_unavailable_for_pair';
  END IF;

  INSERT INTO public.team_conversation_members (conversation_id, profile_id)
  VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN v_conv_id;
END;
$function$
