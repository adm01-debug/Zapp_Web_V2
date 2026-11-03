CREATE OR REPLACE FUNCTION public.toggle_team_reaction(p_message_id uuid, p_emoji text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_exists     boolean;
  v_conversation_id uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- #1265: a função é SECURITY DEFINER, então a RLS não a protege — o vínculo é checado aqui.
  -- A conversa sai da PRÓPRIA mensagem (não de parâmetro), então não há como mentir sobre o time.
  SELECT tm.conversation_id INTO v_conversation_id
    FROM public.team_messages tm
    JOIN public.team_conversation_members tcm
      ON tcm.conversation_id = tm.conversation_id
   WHERE tm.id = p_message_id
     AND tcm.profile_id = v_profile_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.team_message_reactions
     WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.team_message_reactions
     WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji;
    RETURN jsonb_build_object('action', 'removed', 'emoji', p_emoji);
  ELSE
    -- `conversation_id` é NOT NULL e sem default, e `team_message_reactions` (ao contrário de
    -- `team_message_receipts`) não tem trigger que o preencha: sem esta coluna o caminho 'added'
    -- da RPC sempre estourava (null value in column "conversation_id"). Vai o da mensagem.
    INSERT INTO public.team_message_reactions(message_id, profile_id, emoji, conversation_id)
    VALUES (p_message_id, v_profile_id, p_emoji, v_conversation_id)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('action', 'added', 'emoji', p_emoji);
  END IF;
END;
$function$
