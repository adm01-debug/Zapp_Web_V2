-- leaderboard_resolved_online
-- Rollback: devolve public.dashboard_leaderboard ao corpo anterior (resolvidas por agent_achievements 'resolution', is_online = profiles.is_active, média = p50 por first_message_at) e restaura a ACL (REVOKE de anon; GRANT a authenticated/service_role).
-- Rollback (SQL executável, na ordem):
--   create or replace function public.dashboard_leaderboard(p_period text default 'week'::text, p_limit integer default 10) returns jsonb language plpgsql stable set search_path to 'public' as $function$ declare v_since timestamptz; v_result jsonb; begin if not public.is_admin_or_supervisor(auth.uid()) then return '[]'::jsonb; end if; v_since := case p_period when 'today' then date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' when 'month' then (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '29 days') at time zone 'America/Sao_Paulo' when 'all' then '-infinity'::timestamptz else (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '6 days') at time zone 'America/Sao_Paulo' end; with xp_period as materialized (select profile_id, coalesce(sum(xp_earned), 0) as xp, count(*) filter (where achievement_type = 'resolution') as resolved from public.agent_achievements where earned_at >= v_since group by profile_id), messages_period as materialized (select agent_id as profile_id, count(*) as messages_handled from public.messages where created_at >= v_since and sender = 'agent' and agent_id is not null group by agent_id), response_period as materialized (select ct.assigned_to as profile_id, percentile_cont(0.5) within group (order by extract(epoch from (cs.first_response_at - cs.first_message_at))) as median_response_seconds from public.conversation_sla cs join public.contacts ct on ct.id = cs.contact_id where cs.first_message_at >= v_since and cs.first_response_at is not null and ct.assigned_to is not null group by ct.assigned_to), csat_period as materialized (select agent_id as profile_id, (count(*) filter (where rating >= 4))::numeric / count(*) * 100 as csat_percent from public.csat_surveys where created_at >= v_since and agent_id is not null group by agent_id), ranked as (select ast.profile_id, p.name, p.avatar_url as avatar, p.is_active as is_online, ast.level, ast.current_streak as streak, ast.achievements_count, coalesce(x.xp, 0) as xp, coalesce(x.resolved, 0) as conversations_resolved, coalesce(m.messages_handled, 0) as messages_handled, coalesce(round(r.median_response_seconds)::int, 0) as avg_response_time, coalesce(round(c.csat_percent)::int, 0) as satisfaction from public.agent_stats ast join public.profiles p on p.id = ast.profile_id left join xp_period x on x.profile_id = ast.profile_id left join messages_period m on m.profile_id = ast.profile_id left join response_period r on r.profile_id = ast.profile_id left join csat_period c on c.profile_id = ast.profile_id) select coalesce(jsonb_agg(t), '[]'::jsonb) into v_result from (select *, row_number() over (order by xp desc, conversations_resolved desc) as rank from ranked order by xp desc, conversations_resolved desc limit p_limit) t; return v_result; end; $function$;
--   revoke all on function public.dashboard_leaderboard(text, integer) from public;
--   grant execute on function public.dashboard_leaderboard(text, integer) to authenticated, service_role;
--   revoke execute on function public.dashboard_leaderboard(text, integer) from anon;
--
-- Achado da 3ª passada da auditoria de paridade (doc docs/estado/05-features-admin.md),
-- corrigido pela decisão do dono de 13/10: o negócio é ATENDIMENTO RÁPIDO, não "conversa
-- resolvida". O corpo anterior contava `conversations_resolved` como
-- `agent_achievements.achievement_type = 'resolution'`, mas o servidor só concede o marco
-- 'resolution_milestone' (contagens 1/10/50/100/500) — o número ficava em zero ou perto.
-- O `is_online` vinha de `profiles.is_active` (cadastro habilitado), exposto na UI como
-- presença. Esta migration troca as duas fontes:
--
-- conversations_resolved (nome de coluna mantido por compatibilidade da UI) = conversas
-- ATENDIDAS no período = count(distinct cs.contact_id) de conversation_sla com
-- `first_response_at >= v_since`, atribuídas ao agente por `contacts.assigned_to`
-- (mesma atribuição já usada por dashboard_kpi e pela CTE anterior de tempo de resposta).
-- avg_response_time = tempo MÉDIO de 1ª resposta em segundos das conversas atendidas no
-- período (avg de first_response_at - first_message_at), arredondado; 0 quando não há
-- resposta no período — mantido numérico porque os consumidores (useLeaderboard ->
-- AgentPerformancePanel/formatShortDuration) somam e formatam o campo como `number`.
-- is_online = presença fresca: linha em agent_presence com `status <> 'offline'` e
-- heartbeat (`updated_at`) dentro de 90 s (mesmo TTL de expire_stale_agent_presence).
-- xp = continua sendo bônus de marco (agent_achievements.xp_earned): NÃO existe ledger de
-- XP por atendimento ainda (pontuação pendente de decisão do dono) — não se inventa XP.
-- Ordenação do ranking passa a ser por atendidas (sinal real) e XP como desempate.
--
-- O guard de autorização é o mesmo: chamador que não é admin/supervisor recebe '[]'::jsonb.
-- read-only (STABLE, SECURITY INVOKER): não escreve, não dispara gatilho, não muda GRANT além
-- da ACL explícita repetida no fim (mesma da migration 20260926112500).

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
  messages_period AS MATERIALIZED (
    SELECT agent_id AS profile_id, count(*) AS messages_handled
    FROM public.messages
    WHERE created_at >= v_since AND sender = 'agent' AND agent_id IS NOT NULL
    GROUP BY agent_id
  ),
  attended_period AS MATERIALIZED (
    SELECT ct.assigned_to AS profile_id,
           count(DISTINCT cs.contact_id) AS attended,
           avg(extract(epoch FROM (cs.first_response_at - cs.first_message_at))) AS avg_response_seconds
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE cs.first_response_at >= v_since
      AND cs.first_response_at IS NOT NULL
      AND ct.assigned_to IS NOT NULL
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
      coalesce(a.attended, 0) AS conversations_resolved,
      coalesce(m.messages_handled, 0) AS messages_handled,
      coalesce(round(a.avg_response_seconds)::int, 0) AS avg_response_time,
      coalesce(round(c.csat_percent)::int, 0) AS satisfaction
    FROM public.agent_stats ast
    JOIN public.profiles p ON p.id = ast.profile_id
    LEFT JOIN xp_period x ON x.profile_id = ast.profile_id
    LEFT JOIN messages_period m ON m.profile_id = ast.profile_id
    LEFT JOIN attended_period a ON a.profile_id = ast.profile_id
    LEFT JOIN csat_period c ON c.profile_id = ast.profile_id
    LEFT JOIN fresh_presence pr ON pr.user_id = p.user_id
  )
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_result
  FROM (
    SELECT *, row_number() OVER (ORDER BY conversations_resolved DESC, xp DESC) AS rank
    FROM ranked
    ORDER BY conversations_resolved DESC, xp DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) FROM anon;
