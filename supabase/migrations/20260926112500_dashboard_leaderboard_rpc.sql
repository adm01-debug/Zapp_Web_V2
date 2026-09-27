-- Corrige o seletor hoje/semana/mes do ranking da aba Equipe (issue #777),
-- que era 100% decorativo: fetchLeaderboard() sempre buscava agent_stats
-- (contadores cumulativos, sem dimensao de tempo) e ignorava o timeRange.
--
-- A correcao do XP de gamificacao (PR #805) desbloqueou agent_achievements
-- como um ledger com timestamp real por evento de XP -- antes disso, ranking
-- por periodo era estruturalmente impossivel (agent_stats.xp/conversations_resolved
-- sao contadores puros, sem earned_at). Esta RPC usa esse ledger para
-- XP/resolvidas por periodo, messages.agent_id/created_at para mensagens, e
-- conversation_sla (mesmo padrao de join via contacts.assigned_to usado em
-- dashboard_kpi) para tempo de resposta mediano por periodo. Satisfacao usa a
-- mesma formula ja estabelecida em useCSAT.ts/SatisfactionMetrics.tsx
-- (% de respostas com rating >= 4), para nao introduzir uma 2a definicao de
-- CSAT no mesmo dashboard.
--
-- Staff-only (is_admin_or_supervisor), mesmo padrao das outras RPCs do
-- dashboard: retorna [] para agente comum -- o ranking continua OCULTO pra
-- quem nao e staff (matriz de escopo do modulo), sem mudanca de
-- comportamento nesse ponto.
--
-- Testado nesta sessao contra dado real (via set_config('request.jwt.claims')
-- simulando um profile staff e um agente comum, sem mutar producao):
--   - today/week/month devolveram messages_handled diferentes para o mesmo
--     agente (0 / 230 / 1051) -- confirma que o filtro agora tem efeito real.
--   - chamada como agente comum (role='agent') devolveu [] -- guard de RBAC ok.

CREATE OR REPLACE FUNCTION public.dashboard_leaderboard(p_period text DEFAULT 'week', p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'
    ELSE (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'
  END;

  WITH xp_period AS MATERIALIZED (
    SELECT profile_id,
           coalesce(sum(xp_earned), 0) AS xp,
           count(*) FILTER (WHERE achievement_type = 'resolution') AS resolved
    FROM public.agent_achievements
    WHERE earned_at >= v_since
    GROUP BY profile_id
  ),
  messages_period AS MATERIALIZED (
    SELECT agent_id AS profile_id, count(*) AS messages_handled
    FROM public.messages
    WHERE created_at >= v_since AND sender = 'agent' AND agent_id IS NOT NULL
    GROUP BY agent_id
  ),
  response_period AS MATERIALIZED (
    SELECT ct.assigned_to AS profile_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (cs.first_response_at - cs.first_message_at))) AS median_response_seconds
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE cs.first_message_at >= v_since AND cs.first_response_at IS NOT NULL AND ct.assigned_to IS NOT NULL
    GROUP BY ct.assigned_to
  ),
  csat_period AS MATERIALIZED (
    SELECT agent_id AS profile_id,
           (count(*) FILTER (WHERE rating >= 4))::numeric / count(*) * 100 AS csat_percent
    FROM public.csat_surveys
    WHERE created_at >= v_since AND agent_id IS NOT NULL
    GROUP BY agent_id
  ),
  ranked AS (
    SELECT
      ast.profile_id,
      p.name,
      p.avatar_url AS avatar,
      p.is_active AS is_online,
      ast.level,
      ast.current_streak AS streak,
      ast.achievements_count,
      coalesce(x.xp, 0) AS xp,
      coalesce(x.resolved, 0) AS conversations_resolved,
      coalesce(m.messages_handled, 0) AS messages_handled,
      coalesce(round(r.median_response_seconds)::int, 0) AS avg_response_time,
      coalesce(round(c.csat_percent)::int, 0) AS satisfaction
    FROM public.agent_stats ast
    JOIN public.profiles p ON p.id = ast.profile_id
    LEFT JOIN xp_period x ON x.profile_id = ast.profile_id
    LEFT JOIN messages_period m ON m.profile_id = ast.profile_id
    LEFT JOIN response_period r ON r.profile_id = ast.profile_id
    LEFT JOIN csat_period c ON c.profile_id = ast.profile_id
  )
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_result
  FROM (
    SELECT *, row_number() OVER (ORDER BY xp DESC, conversations_resolved DESC) AS rank
    FROM ranked
    ORDER BY xp DESC, conversations_resolved DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) TO authenticated, service_role;
