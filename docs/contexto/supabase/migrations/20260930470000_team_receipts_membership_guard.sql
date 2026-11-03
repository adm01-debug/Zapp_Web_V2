CREATE OR REPLACE FUNCTION public.mark_team_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_now        timestamptz := now();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Sem esta guarda, um perfil de OUTRO time gravava recibos de leitura numa conversa a que nao
  -- pertence: a funcao e SECURITY DEFINER e nao passa por RLS (auditoria Onda 3, achado 2).
  -- O helper recebe o id de `auth.users` (como em todas as policies: `is_team_conversation_member(
  -- auth.uid(), conversation_id)`), NAO o id de `profiles` — passar `v_profile_id` aqui fecharia o
  -- caminho legitimo junto (foi o que o harness B.3 pegou).
  IF NOT public.is_team_conversation_member(auth.uid(), p_conversation_id) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  INSERT INTO public.team_message_receipts(message_id, profile_id, status, delivered_at, read_at)
  SELECT m.id, v_profile_id, 'read', v_now, v_now
    FROM public.team_messages m
   WHERE m.conversation_id = p_conversation_id
     AND m.sender_id <> v_profile_id
     AND NOT EXISTS (
       SELECT 1 FROM public.team_message_receipts r
        WHERE r.message_id = m.id AND r.profile_id = v_profile_id AND r.status = 'read'
     )
  ON CONFLICT (message_id, profile_id) DO UPDATE
     SET status = 'read', read_at = v_now;

  UPDATE public.team_conversation_members
     SET last_read_at = v_now
   WHERE conversation_id = p_conversation_id
     AND profile_id = v_profile_id;
END;
$function$
