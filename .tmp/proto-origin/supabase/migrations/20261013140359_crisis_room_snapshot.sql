-- crisis_room_snapshot
-- Rollback: drop function if exists public.crisis_room_snapshot();
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.crisis_room_snapshot();
--
-- R2-AUTH-036 (Sala de Crise) — as 4 métricas da tela passam a ser medidas no
-- banco, num único agregado. Dois defeitos da ponte no navegador morrem aqui:
--   (1) o corte silencioso de 1.000 linhas do PostgREST transformava operação
--       grande em número pequeno (métrica que mente justamente na crise);
--   (2) não havia funil único de janela/fuso — o SLA contava estouros de todo o
--       histórico, não das últimas 24 h.
--
-- Paridade com src/components/admin/CrisisRoom.tsx (definições das métricas):
--   * unanswered_messages / unanswered_conversations — "Msgs sem resposta (1h)":
--     mensagens de contato (sender='contact') dos últimos 60 min SEM resposta
--     posterior do atendimento (sender='agent') na mesma conversa (contact_id).
--     Conta mensagens e contatos distintos.
--   * online_agents / total_agents — "Agentes ativos": presença REAL em
--     public.agent_presence (status='online' e heartbeat há menos de 75 s, o
--     mesmo corte do useAgentPresenceMap), restrita a contas habilitadas de
--     atendimento (profiles.is_active e role in agent/admin/supervisor).
--     NUNCA profiles.is_active sozinho — era exatamente o proxy que inflava.
--   * sla_breached — "SLA estourados": conversation_sla.first_response_breached
--     E (first_response_at IS NULL OU criado nas últimas 24 h), no fuso
--     America/Sao_Paulo.
--   * queue_ratio — "Carga por agente": contatos pendentes / agentes online;
--     NULL quando não há agente online (não inventa 0).
--
-- Acesso: SECURITY DEFINER (precisa enxergar TODAS as conversas, não apenas as
-- do chamador) com barreira explícita de admin/supervisor. Quem não for, recebe
-- exceção — nunca zeros. Falha de medição nunca vira "operação normal".
CREATE OR REPLACE FUNCTION public.crisis_room_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- Só admin/supervisor autenticado chama; anon e service_role ficam de fora (a
-- função enxerga tudo e não deve virar atalho de leitura por chave de serviço).
REVOKE ALL ON FUNCTION public.crisis_room_snapshot() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.crisis_room_snapshot() TO authenticated;
