-- GAP-MÉDIO-1: agent_stats INSERT policy permite valores arbitrários (XP inflado desde o dia 0)
-- Solução: WITH CHECK força xp=0/level=1 para usuários comuns; admins mantêm acesso irrestrito
DROP POLICY IF EXISTS "Users can insert own stats" ON public.agent_stats;
CREATE POLICY "Users can insert own stats" ON public.agent_stats
  FOR INSERT TO authenticated
  WITH CHECK (
    (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
     OR is_admin_or_supervisor(auth.uid()))
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (xp = 0 AND level = 1 AND achievements_count = 0)
    )
  );

-- GAP-BAIXO: increment_agent_messages rejeita 'SENT'/'RECEIVED' (case-sensitive sem normalização)
-- Solução: lower(p_type) antes da validação
CREATE OR REPLACE FUNCTION public.increment_agent_messages(p_profile_id uuid, p_type text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row         agent_stats%ROWTYPE;
  v_new_sent    int;
  v_new_recv    int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  p_type := lower(p_type);
  IF p_type NOT IN ('sent', 'received') THEN
    RAISE EXCEPTION 'p_type must be ''sent'' or ''received'', got %', p_type;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_sent := COALESCE(v_row.messages_sent, 0);
  v_new_recv := COALESCE(v_row.messages_received, 0);

  IF p_type = 'sent' THEN
    v_new_sent := v_new_sent + 1;
  ELSE
    v_new_recv := v_new_recv + 1;
  END IF;

  UPDATE agent_stats
  SET messages_sent     = v_new_sent,
      messages_received = v_new_recv,
      updated_at        = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newSent', v_new_sent, 'newReceived', v_new_recv);
END;
$$;
