CREATE OR REPLACE FUNCTION public.crisis_room_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now              timestamptz := now();
  v_window           interval := interval '60 minutes';
  v_presence_ttl     interval := interval '75 seconds';
  v_sla_window       interval := interval '24 hours';
  v_unanswered_msgs  integer;
  v_unanswered_convs integer;
  v_online_agents    integer;
  v_total_agents     integer;
  v_sla_breached     integer;
  v_queue_ratio      numeric;
BEGIN
  -- Sem barreira de RLS aqui (DEFINER): a autorização é explícita e idêntica
  -- para todo não autorizado (sem oráculo de enumeração).
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'crisis_room_snapshot requires admin or supervisor'
      USING ERRCODE = '42501';
  END IF;

  -- 1) Mensagens de contato da última hora ainda sem resposta posterior.
  SELECT count(*), count(DISTINCT m.contact_id)
    INTO v_unanswered_msgs, v_unanswered_convs
  FROM public.messages m
  WHERE m.sender = 'contact'
    AND m.contact_id IS NOT NULL
    AND m.created_at >= v_now - v_window
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages r
      WHERE r.contact_id = m.contact_id
        AND r.sender = 'agent'
        AND r.created_at > m.created_at
    );

  -- 2) Universo habilitado de atendimento (quem PODE estar online).
  SELECT count(DISTINCT p.user_id)
    INTO v_total_agents
  FROM public.profiles p
  WHERE p.is_active
    AND p.role IN ('agent', 'admin', 'supervisor');

  -- 3) Presença real: heartbeat recente, dentro do universo habilitado.
  SELECT count(DISTINCT ap.user_id)
    INTO v_online_agents
  FROM public.agent_presence ap
  JOIN public.profiles p ON p.user_id = ap.user_id
  WHERE ap.status = 'online'
    AND ap.updated_at >= v_now - v_presence_ttl
    AND p.is_active
    AND p.role IN ('agent', 'admin', 'supervisor');

  -- 4) SLA estourado e ainda em aberto, ou estourado nas últimas 24 h.
  SELECT count(*)
    INTO v_sla_breached
  FROM public.conversation_sla s
  WHERE s.first_response_breached
    AND (s.first_response_at IS NULL
         OR s.created_at >= v_now - v_sla_window);

  -- 5) Carga pendente por agente online (NULL sem agente online, nunca 0).
  IF v_online_agents > 0 THEN
    v_queue_ratio := round(v_unanswered_convs::numeric / v_online_agents, 2);
  ELSE
    v_queue_ratio := NULL;
  END IF;

  RETURN jsonb_build_object(
    'unanswered_messages', v_unanswered_msgs,
    'unanswered_conversations', v_unanswered_convs,
    'online_agents', v_online_agents,
    'total_agents', v_total_agents,
    'sla_breached', v_sla_breached,
    'queue_ratio', v_queue_ratio,
    'window_minutes', 60,
    'sla_window_hours', 24,
    'cycle_date_sp', (v_now AT TIME ZONE 'America/Sao_Paulo')::date::text,
    'generated_at', v_now
  );
END;
$function$
