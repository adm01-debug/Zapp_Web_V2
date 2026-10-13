-- dashboard_kpi_periodo
-- Rollback: dropa a assinatura nova (p_from, p_until, p_queue, p_agent), recria public.dashboard_kpi(p_since, p_queue, p_agent) com o corpo ANTERIOR COMPLETO (abaixo) e restaura a ACL de antes (REVOKE anon/PUBLIC + GRANT authenticated).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.dashboard_kpi(timestamp with time zone, timestamp with time zone, uuid, uuid);
--   create or replace function public.dashboard_kpi(p_since timestamp with time zone default (now() - '1 day'::interval), p_queue uuid default null::uuid, p_agent uuid default null::uuid) returns jsonb language plpgsql stable set search_path to 'public' as $function$ declare v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_yesterday date := (now() at time zone 'America/Sao_Paulo')::date - 1; v_is_staff boolean := public.is_admin_or_supervisor(auth.uid()); v_result jsonb; begin if not v_is_staff then p_agent := public.get_profile_id_for_user(auth.uid()); end if; with closures as (select (cc.created_at at time zone 'America/Sao_Paulo')::date as day, extract(hour from cc.created_at at time zone 'America/Sao_Paulo')::int as hour, cc.contact_id from public.conversation_closures cc join public.contacts ct on ct.id = cc.contact_id where (p_since is null or cc.created_at >= p_since) and (p_queue is null or ct.queue_id = p_queue) and ((v_is_staff and p_agent is null) or ct.assigned_to = p_agent)), sla_rows as (select (cs.first_message_at at time zone 'America/Sao_Paulo')::date as day, extract(hour from cs.first_message_at at time zone 'America/Sao_Paulo')::int as hour, cs.first_response_at, extract(epoch from (cs.first_response_at - cs.first_message_at)) as response_seconds, cs.first_response_breached from public.conversation_sla cs join public.contacts ct on ct.id = cs.contact_id where (p_since is null or cs.first_message_at >= p_since) and (p_queue is null or ct.queue_id = p_queue) and ((v_is_staff and p_agent is null) or ct.assigned_to = p_agent)), resolved_hourly as (select least(7, hour / 3) as bucket, count(*) as c from (select distinct on (contact_id) hour from closures where day = v_today order by contact_id, hour) as first_closure_of_day group by 1), answered_today as (select response_seconds from sla_rows where day = v_today and first_response_at is not null), answered_yesterday as (select response_seconds from sla_rows where day = v_yesterday and first_response_at is not null), response_hourly as (select least(7, hour / 3) as bucket, avg(response_seconds) as avg_s from sla_rows where day = v_today and first_response_at is not null group by 1) select jsonb_build_object('resolvedToday', (select count(distinct contact_id) from closures where day = v_today), 'resolvedYesterday', (select count(distinct contact_id) from closures where day = v_yesterday), 'resolvedHourly8', (select jsonb_agg(coalesce(rh.c, 0) order by g.b) from generate_series(0, 7) g(b) left join resolved_hourly rh on rh.bucket = g.b), 'avgResponseToday', (select round(percentile_cont(0.5) within group (order by response_seconds))::int from answered_today), 'avgResponseYesterday', (select round(percentile_cont(0.5) within group (order by response_seconds))::int from answered_yesterday), 'p90ResponseToday', (select round(percentile_cont(0.9) within group (order by response_seconds))::int from answered_today), 'responseHourly8', (select jsonb_agg(round(coalesce(rh.avg_s, 0))::int order by g.b) from generate_series(0, 7) g(b) left join response_hourly rh on rh.bucket = g.b), 'slaBreachedToday', (select count(*) from sla_rows where day = v_today and first_response_breached is true), 'answeredTodayCount', (select count(*) from answered_today), 'answeredYesterdayCount', (select count(*) from answered_yesterday)) into v_result; return v_result; end; $function$;
--   revoke execute on function public.dashboard_kpi(timestamp with time zone, uuid, uuid) from anon;
--   revoke execute on function public.dashboard_kpi(timestamp with time zone, uuid, uuid) from public;
--   grant execute on function public.dashboard_kpi(timestamp with time zone, uuid, uuid) to authenticated;

-- E31/E34 + IA-056: a RPC dashboard_kpi passa a HONRAR o periodo escolhido no filtro
-- do topo. Antes os buckets eram fixos em hoje/ontem (v_today/v_yesterday por
-- now() AT TIME ZONE 'America/Sao_Paulo') e p_since era so piso de linha.
--
-- Nova assinatura: dashboard_kpi(p_from, p_until, p_queue, p_agent), com defaults
-- = dia atual em America/Sao_Paulo (00:00 de hoje ate 00:00 de amanha, fuso SP).
-- A RPC devolve, no MESMO shape consumido pelo front (resolvedToday/... /),
-- as metricas do periodo [p_from, p_until) E do periodo ANTERIOR de MESMO TAMANHO,
-- em janelas ENCOSTADAS e com fim EXCLUSIVO (created_at < p_until) — padrao IA-056,
-- para nenhum registro ser contado nos dois lados. p_until NULL = janela aberta
-- (sem teto); nesse caso o periodo anterior tem o mesmo tamanho ja decorrido
-- (now() - p_from).
--
-- Mantido: SECURITY INVOKER (sem SECURITY DEFINER) e a trava E33 para nao-staff.
-- A assinatura antiga (3 args) e removida NA MESMA migration para nao sobrar
-- overload ambiguo no PostgREST; a ACL e reaplicada para a assinatura nova.

-- (1) Remove a assinatura antiga: sem ela, o PostgREST teria dois dashboard_kpi e
-- a resolucao por nome ficaria ambigua para as chamadas do front.
DROP FUNCTION IF EXISTS public.dashboard_kpi(timestamp with time zone, uuid, uuid);

-- (2) RPC nova (SECURITY INVOKER — sem clausula SECURITY DEFINER —, como antes).
CREATE OR REPLACE FUNCTION public.dashboard_kpi(
  p_from  timestamp with time zone DEFAULT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),
  p_until timestamp with time zone DEFAULT ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo'),
  p_queue uuid DEFAULT NULL::uuid,
  p_agent uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_start  timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_is_staff   boolean     := public.is_admin_or_supervisor(auth.uid());
  v_from       timestamptz := coalesce(p_from, v_day_start);
  v_until      timestamptz := p_until;                 -- NULL = janela aberta
  v_len        interval    := CASE
                                WHEN v_until IS NOT NULL THEN v_until - v_from
                                ELSE greatest(now() - v_from, interval '0')
                              END;
  v_prev_from  timestamptz := v_from - v_len;          -- inicio do periodo anterior
  v_prev_until timestamptz := v_from;                  -- fim EXCLUSIVO = inicio do atual
  v_result     jsonb;
BEGIN
  -- E33: para nao-staff o p_agent e IGNORADO e travado no proprio perfil.
  IF NOT v_is_staff THEN
    p_agent := public.get_profile_id_for_user(auth.uid());
  END IF;

  WITH closures AS (
    SELECT
      cc.created_at,
      cc.contact_id,
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS sp_day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS sp_hour
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
      -- recorta so a uniao dos dois periodos (periodo atual + anterior)
      AND cc.created_at >= v_prev_from
      AND (v_until IS NULL OR cc.created_at < v_until)
  ),
  current_closures AS (
    SELECT * FROM closures
    WHERE created_at >= v_from AND (v_until IS NULL OR created_at < v_until)
  ),
  prev_closures AS (
    SELECT * FROM closures
    WHERE created_at >= v_prev_from AND created_at < v_prev_until
  ),
  sla_rows AS (
    SELECT
      cs.first_message_at,
      cs.first_response_at,
      extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds,
      cs.first_response_breached
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
      AND cs.first_message_at >= v_prev_from
      AND (v_until IS NULL OR cs.first_message_at < v_until)
  ),
  current_sla AS (
    SELECT * FROM sla_rows
    WHERE first_message_at >= v_from AND (v_until IS NULL OR first_message_at < v_until)
  ),
  prev_sla AS (
    SELECT * FROM sla_rows
    WHERE first_message_at >= v_prev_from AND first_message_at < v_prev_until
  ),
  resolved_hourly AS (
    -- Varios encerramentos do MESMO contato no MESMO dia civil contam UMA vez,
    -- no horario do primeiro do dia: era exatamente o que o indice unico diario
    -- (removido na 20261007013217) garantia para os indicadores.
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM (
      SELECT DISTINCT ON (contact_id, sp_day) sp_hour AS hour
      FROM current_closures
      ORDER BY contact_id, sp_day, sp_hour
    ) AS first_closure_of_day
    GROUP BY 1
  ),
  response_hourly AS (
    SELECT least(7, extract(hour FROM first_message_at AT TIME ZONE 'America/Sao_Paulo')::int / 3) AS bucket,
           avg(response_seconds) AS avg_s
    FROM current_sla
    WHERE first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday',          (SELECT count(DISTINCT contact_id) FROM current_closures),
    'resolvedYesterday',      (SELECT count(DISTINCT contact_id) FROM prev_closures),
    'resolvedHourly8',        (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                               FROM generate_series(0, 7) g(b)
                               LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday',       (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                               FROM current_sla WHERE first_response_at IS NOT NULL),
    'avgResponseYesterday',   (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                               FROM prev_sla WHERE first_response_at IS NOT NULL),
    'p90ResponseToday',       (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
                               FROM current_sla WHERE first_response_at IS NOT NULL),
    'responseHourly8',        (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                               FROM generate_series(0, 7) g(b)
                               LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday',       (SELECT count(*) FROM current_sla WHERE first_response_breached IS TRUE),
    'answeredTodayCount',     (SELECT count(*) FROM current_sla WHERE first_response_at IS NOT NULL),
    'answeredYesterdayCount', (SELECT count(*) FROM prev_sla WHERE first_response_at IS NOT NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- (3) ACL para a assinatura NOVA: so authenticated executa; anon e PUBLIC ficam
-- de fora (mesmo hardening reaplicado das migrations 20260926100134 / 20260926100302).
REVOKE EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, timestamp with time zone, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, timestamp with time zone, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, timestamp with time zone, uuid, uuid) TO authenticated;
