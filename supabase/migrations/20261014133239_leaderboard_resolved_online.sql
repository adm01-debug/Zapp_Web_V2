-- leaderboard_resolved_online
-- Rollback: restaura public.dashboard_leaderboard ao corpo anterior e a ACL (SQL executavel: extraia as linhas entre ROLLBACK-BEGIN e ROLLBACK-END removendo o prefixo "-- ").
-- ROLLBACK-BEGIN
-- CREATE OR REPLACE FUNCTION public.dashboard_leaderboard(p_period text DEFAULT 'week'::text, p_limit integer DEFAULT 10)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_since  timestamptz;
--   v_result jsonb;
-- BEGIN
--   IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
--     RETURN '[]'::jsonb;
--   END IF;
--
--   v_since := CASE p_period
--     WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
--     WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'
--     WHEN 'all'   THEN '-infinity'::timestamptz
--     ELSE              (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'
--   END;
--
--   WITH xp_period AS MATERIALIZED (
--     SELECT profile_id,
--            coalesce(sum(xp_earned), 0) AS xp,
--            count(*) FILTER (WHERE achievement_type = 'resolution') AS resolved
--     FROM public.agent_achievements
--     WHERE earned_at >= v_since
--     GROUP BY profile_id
--   ),
--   messages_period AS MATERIALIZED (
--     SELECT agent_id AS profile_id, count(*) AS messages_handled
--     FROM public.messages
--     WHERE created_at >= v_since AND sender = 'agent' AND agent_id IS NOT NULL
--     GROUP BY agent_id
--   ),
--   response_period AS MATERIALIZED (
--     SELECT ct.assigned_to AS profile_id,
--            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (cs.first_response_at - cs.first_message_at))) AS median_response_seconds
--     FROM public.conversation_sla cs
--     JOIN public.contacts ct ON ct.id = cs.contact_id
--     WHERE cs.first_message_at >= v_since AND cs.first_response_at IS NOT NULL AND ct.assigned_to IS NOT NULL
--     GROUP BY ct.assigned_to
--   ),
--   csat_period AS MATERIALIZED (
--     SELECT agent_id AS profile_id,
--            (count(*) FILTER (WHERE rating >= 4))::numeric / count(*) * 100 AS csat_percent
--     FROM public.csat_surveys
--     WHERE created_at >= v_since AND agent_id IS NOT NULL
--     GROUP BY agent_id
--   ),
--   ranked AS (
--     SELECT
--       ast.profile_id,
--       p.name,
--       p.avatar_url AS avatar,
--       p.is_active AS is_online,
--       ast.level,
--       ast.current_streak AS streak,
--       ast.achievements_count,
--       coalesce(x.xp, 0) AS xp,
--       coalesce(x.resolved, 0) AS conversations_resolved,
--       coalesce(m.messages_handled, 0) AS messages_handled,
--       coalesce(round(r.median_response_seconds)::int, 0) AS avg_response_time,
--       coalesce(round(c.csat_percent)::int, 0) AS satisfaction
--     FROM public.agent_stats ast
--     JOIN public.profiles p ON p.id = ast.profile_id
--     LEFT JOIN xp_period x ON x.profile_id = ast.profile_id
--     LEFT JOIN messages_period m ON m.profile_id = ast.profile_id
--     LEFT JOIN response_period r ON r.profile_id = ast.profile_id
--     LEFT JOIN csat_period c ON c.profile_id = ast.profile_id
--   )
--   SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_result
--   FROM (
--     SELECT *, row_number() OVER (ORDER BY xp DESC, conversations_resolved DESC) AS rank
--     FROM ranked
--     ORDER BY xp DESC, conversations_resolved DESC
--     LIMIT p_limit
--   ) t;
--
--   RETURN v_result;
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.dashboard_leaderboard(text, integer) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) TO authenticated, service_role;
-- REVOKE EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) FROM anon;
-- ROLLBACK-END
--
-- Achado da 3a passada da auditoria de paridade (doc docs/estado/05-features-admin.md).
-- O corpo anterior contava `conversations_resolved` como
-- `agent_achievements.achievement_type = 'resolution'`, mas o servidor so concede o marco
-- 'resolution_milestone' (contagens 1/10/50/100/500) - o numero ficava em zero ou perto.
-- O `is_online` vinha de `profiles.is_active` (cadastro habilitado), exposto na UI como
-- presenca. Esta migration troca as duas fontes:
--
-- conversations_resolved = conversas ENCERRADAS no periodo = count(*) de
-- public.conversation_closures com `created_at >= v_since`, atribuidas ao agente por
-- `closed_by` (perfil que encerrou).
-- avg_response_time = p50 do tempo de 1a resposta em segundos no periodo
-- (percentile_cont sobre first_response_at - first_message_at, filtrando por
-- first_message_at >= v_since) - inalterado.
-- is_online = presenca fresca: linha em agent_presence com `status <> 'offline'` e
-- heartbeat (`updated_at`) dentro de 90 s (mesmo TTL de expire_stale_agent_presence).
-- xp = continua sendo bonus de marco (agent_achievements.xp_earned): NAO existe ledger de
-- XP por atendimento ainda (pontuacao pendente de decisao do dono) - nao se inventa XP.
-- Ordenacao do ranking: xp DESC, conversations_resolved DESC (inalterada).
--
-- O guard de autorizacao e o mesmo: chamador que nao e admin/supervisor recebe '[]'::jsonb.
-- read-only (STABLE, SECURITY INVOKER): nao escreve, nao dispara gatilho, nao muda GRANT alem
-- da ACL explicita repetida no fim (mesma das migrations 20260926112500 e 20260926161500).

CREATE OR REPLACE FUNCTION public.dashboard_leaderboard(p_period text DEFAULT 'week'::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since  timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'all'   THEN '-infinity'::timestamptz
    ELSE              (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'
  END;

  WITH xp_period AS MATERIALIZED (
    SELECT profile_id,
           coalesce(sum(xp_earned), 0) AS xp
    FROM public.agent_achievements
    WHERE earned_at >= v_since
    GROUP BY profile_id
  ),
  closed_period AS MATERIALIZED (
    SELECT closed_by AS profile_id,
           count(*) AS resolved
    FROM public.conversation_closures
    WHERE created_at >= v_since
      AND closed_by IS NOT NULL
    GROUP BY closed_by
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
  fresh_presence AS MATERIALIZED (
    SELECT ap.user_id
    FROM public.agent_presence ap
    WHERE ap.status <> 'offline'
      AND ap.updated_at >= now() - interval '90 seconds'
  ),
  ranked AS (
    SELECT
      ast.profile_id,
      p.name,
      p.avatar_url AS avatar,
      (pr.user_id IS NOT NULL) AS is_online,
      ast.level,
      ast.current_streak AS streak,
      ast.achievements_count,
      coalesce(x.xp, 0) AS xp,
      coalesce(cl.resolved, 0) AS conversations_resolved,
      coalesce(m.messages_handled, 0) AS messages_handled,
      coalesce(round(r.median_response_seconds)::int, 0) AS avg_response_time,
      coalesce(round(c.csat_percent)::int, 0) AS satisfaction
    FROM public.agent_stats ast
    JOIN public.profiles p ON p.id = ast.profile_id
    LEFT JOIN xp_period x ON x.profile_id = ast.profile_id
    LEFT JOIN closed_period cl ON cl.profile_id = ast.profile_id
    LEFT JOIN messages_period m ON m.profile_id = ast.profile_id
    LEFT JOIN response_period r ON r.profile_id = ast.profile_id
    LEFT JOIN csat_period c ON c.profile_id = ast.profile_id
    LEFT JOIN fresh_presence pr ON pr.user_id = p.user_id
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
REVOKE EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) FROM anon;
