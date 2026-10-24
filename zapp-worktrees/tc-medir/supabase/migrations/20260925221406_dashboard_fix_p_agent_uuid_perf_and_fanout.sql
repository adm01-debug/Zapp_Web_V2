-- Fix crítico: as 3 RPCs do dashboard usavam auth.uid() (profiles.user_id) como p_agent
-- para não-staff, mas contacts.assigned_to/messages.agent_id referenciam profiles.id
-- (FK distinta) — todo agente comum via zero em produção desde a migration da E33 (PR #750).
-- Também: materializa o CTE "effective" (parava de ser inlineado por causa do CASE com
-- função STABLE, e is_admin_or_supervisor() era reavaliado por linha do join — regressão
-- de performance ~5-12x medida nesta sessão); fail-closed quando get_profile_id_for_user
-- retorna NULL (evita abrir o filtro pra "ver tudo" nesse caso de borda); dedupe + fuso SP
-- + respeito a p_since/p_until em sla_today (dashboard_contact_counts, fan-out no
-- breakdown por fila com contato tendo >1 linha de SLA "hoje", e "hoje" calculado em UTC
-- em vez de America/Sao_Paulo).
--
-- NOTA (25/09/2026, sessão de captura pós-fato): esta DDL já estava aplicada e ativa em
-- produção quando esta sessão começou (ledger supabase_migrations.schema_migrations já
-- tinha a entrada, versão idêntica a este arquivo), mas nunca tinha sido commitada no
-- git — drift entre banco e repositório. Este arquivo apenas registra, para revisão,
-- a DDL que já está viva; nenhum DDL novo foi aplicado ao banco por esta migration.
-- Reverificado ao vivo nesta sessão via set_config('request.jwt.claims', ...) simulando
-- um agente comum real (profile 8c9e4762-3961-4d0c-b2c9-3cce5ce5cacb, 1.389 contatos
-- reais atribuídos): dashboard_kpi/dashboard_contact_counts/dashboard_hourly_volume
-- retornam os dados reais do agente (não mais zero); o mesmo agente tentando passar
-- p_agent de outro agente (profile 26f4cf11-ad9c-433a-a892-6b296f233101, "ti Promo",
-- 1.388 contatos) continua recebendo de volta apenas os PRÓPRIOS dados — a trava
-- ignora o p_agent recebido para não-staff. Admin filtrando por p_agent de cada um dos
-- dois agentes continua retornando contagens corretas e distintas (1389 vs 1388),
-- sem regressão para staff. Fronteira de "hoje" de dashboard_contact_counts confirmada
-- idêntica, ao segundo, à de dashboard_kpi (ambas fecham em 2026-09-25T03:00:00Z para
-- "agora" = 2026-09-25T22:57:38Z, America/Sao_Paulo) — o boundary ingênuo antigo
-- (date_trunc('day', now()) sem AT TIME ZONE) fechava 3h adiantado.

CREATE OR REPLACE FUNCTION public.dashboard_contact_counts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH effective AS MATERIALIZED (
    SELECT
      public.is_admin_or_supervisor(auth.uid()) AS is_staff,
      CASE WHEN public.is_admin_or_supervisor(auth.uid())
           THEN p_agent
           ELSE public.get_profile_id_for_user(auth.uid())
      END AS agent
  ),
  filtered AS (
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM contacts c, effective e
    WHERE (p_queue IS NULL OR c.queue_id = p_queue)
      AND ((e.is_staff AND e.agent IS NULL) OR c.assigned_to = e.agent)
      AND (p_since IS NULL OR c.updated_at >= p_since)
      AND (p_until IS NULL OR c.updated_at <= p_until)
  ),
  sla_today AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at, s.first_response_breached
    FROM conversation_sla s
    WHERE s.first_message_at >= COALESCE(p_since, (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo')
      AND (p_until IS NULL OR s.first_message_at <= p_until)
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  per_queue AS (
    SELECT
      f.queue_id,
      count(*) FILTER (WHERE f.assigned_to IS NULL) AS waiting,
      count(*) FILTER (WHERE f.assigned_to IS NOT NULL) AS in_service,
      round((avg(EXTRACT(EPOCH FROM (st.first_response_at - st.first_message_at)))
             FILTER (WHERE st.first_response_at IS NOT NULL))::numeric) AS avg_response,
      round((100.0 * count(*) FILTER (WHERE st.first_response_breached IS FALSE)
             / NULLIF(count(*) FILTER (WHERE st.contact_id IS NOT NULL), 0))::numeric) AS sla_rate
    FROM filtered f
    LEFT JOIN sla_today st ON st.contact_id = f.id
    WHERE f.queue_id IS NOT NULL
    GROUP BY f.queue_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'open', (SELECT count(*) FROM filtered WHERE assigned_to IS NOT NULL AND conversation_status = 'open'),
    'pending', (SELECT count(*) FROM filtered WHERE assigned_to IS NULL AND queue_id IS NOT NULL AND conversation_status NOT IN ('resolved', 'archived')),
    'myActive', (SELECT count(*) FROM filtered WHERE assigned_to = public.get_profile_id_for_user(auth.uid())),
    'queues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'queueId', queue_id,
        'waiting', waiting,
        'inService', in_service,
        'avgResponse', avg_response,
        'slaRate', sla_rate
      ))
      FROM per_queue
    ), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_hourly_volume(p_days integer DEFAULT 8, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, hour integer, message_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH effective AS MATERIALIZED (
    SELECT
      public.is_admin_or_supervisor(auth.uid()) AS is_staff,
      CASE WHEN public.is_admin_or_supervisor(auth.uid())
           THEN p_agent
           ELSE public.get_profile_id_for_user(auth.uid())
      END AS agent
  )
  SELECT
    (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    extract(hour FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    count(*) AS message_count
  FROM public.messages m
  LEFT JOIN public.contacts ct ON ct.id = m.contact_id
  CROSS JOIN effective e
  WHERE m.created_at >= (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    - (make_interval(days => greatest(least(coalesce(p_days, 8), 31), 1) - 1))
  ) AT TIME ZONE 'America/Sao_Paulo'
    AND (p_queue IS NULL OR ct.queue_id = p_queue)
    AND ((e.is_staff AND e.agent IS NULL) OR ct.assigned_to = e.agent)
  GROUP BY 1, 2;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone, p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_is_staff boolean := public.is_admin_or_supervisor(auth.uid());
  v_result jsonb;
BEGIN
  IF NOT v_is_staff THEN
    p_agent := public.get_profile_id_for_user(auth.uid());
  END IF;

  WITH closures AS (
    SELECT
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE cc.created_at >= p_since
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  sla_rows AS (
    SELECT
      (cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cs.first_response_at,
      extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds,
      cs.first_response_breached
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE cs.first_message_at >= p_since
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  resolved_hourly AS (
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM closures WHERE day = v_today GROUP BY 1
  ),
  answered_today AS (
    SELECT response_seconds FROM sla_rows WHERE day = v_today AND first_response_at IS NOT NULL
  ),
  answered_yesterday AS (
    SELECT response_seconds FROM sla_rows WHERE day = v_yesterday AND first_response_at IS NOT NULL
  ),
  response_hourly AS (
    SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM sla_rows WHERE day = v_today AND first_response_at IS NOT NULL GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday', (SELECT count(*) FROM closures WHERE day = v_today),
    'resolvedYesterday', (SELECT count(*) FROM closures WHERE day = v_yesterday),
    'resolvedHourly8', (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                         FROM generate_series(0, 7) g(b) LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_today),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_yesterday),
    'p90ResponseToday', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int FROM answered_today),
    'responseHourly8', (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                         FROM generate_series(0, 7) g(b) LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday', (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
    'answeredTodayCount', (SELECT count(*) FROM answered_today),
    'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
