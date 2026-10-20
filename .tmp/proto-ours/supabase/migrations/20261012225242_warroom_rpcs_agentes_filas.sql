-- warroom_rpcs_agentes_filas
-- Rollback: dropa as duas funções novas (não havia versão anterior no repositório).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.warroom_agent_today(date);
--   drop function if exists public.warroom_queue_stats();
--
-- R2-MOD-030: o War Room calculava os cartões do dia no NAVEGADOR — lia `profiles`,
-- `agent_stats`, `contacts` pagina a pagina com `fetchAllRows`, e resolvia a contagem do dia
-- por somatório em memória. Duas consequências medidas: (a) a paginação do PostgREST corta em
-- 1000 linhas e qualquer carteira acima disso virava subtotal silencioso; (b) `agent_stats`
-- guarda acumulado de vida (`conversations_resolved`, `avg_response_time_seconds`,
-- `customer_satisfaction_score`) — o rótulo "de hoje" mentia, e ausência de amostra saía como
-- 0,0 (lido pela supervisão como "zero resolvido" em vez de "não medido").
--
-- Estas duas RPCs agregam no banco, com o mesmo dia civil já usado pelo Dashboard
-- (America/Sao_Paulo — `(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME
-- ZONE 'America/Sao_Paulo'`) e reusam a regra de `conversation_sla` do
-- `dashboard_contact_counts` (DISTINCT ON por contato, a linha de SLA MAIS RECENTE — sem isso
-- contato com mais de uma linha de SLA no período multiplica linhas no fan-out por fila).
-- Não há mais corte de 1000: o agregado é uma linha por agente/fila.
--
-- Classe: aditiva — só funções NOVAS, sem DML, sem tocar objeto vivo (nenhum DROP/ALTER/RENAME
-- de tabela, coluna, policy ou função existente) e sem mudar GRANT de nada que já existia.
-- Contrato: os nomes de campo jsonb são os mesmos que o hook já usa (camelCase) —
-- `WarRoomAgent` (src/hooks/business/useWarRoomData.ts) e `WarRoomQueue`.
-- Medição ausente vai como `null`, nunca como 0: `avgResponseTime` e `satisfaction` por agente,
-- `slaWarnings` e `avgWaitTime` por fila.
--
-- Fronteira de autorização: dado de supervisão (desempenho por pessoa) — EXECUTE fechado para
-- PUBLIC e anon, aberto só a authenticated/service_role, e a função ainda devolve `[]`
-- (vazio) para quem não é admin/supervisor, mesmo autenticado.

-- Prazo de "resposta em risco": fração do prazo configurado de 1ª resposta a partir da qual o
-- contato ainda sem resposta é contado como risco. O prazo vem de `sla_configurations`
-- (`first_response_minutes`), com fallback para a configuração default ativa.
CREATE OR REPLACE FUNCTION public.warroom_agent_today(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT public.is_admin_or_supervisor(auth.uid()) AS is_staff
  ),
  win AS (
    SELECT COALESCE(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS d
  ),
  bounds AS (
    SELECT
      (w.d::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t0,
      ((w.d + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t1
    FROM win w
  ),
  sla_day AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at
    FROM public.conversation_sla s, bounds b
    WHERE s.first_message_at >= b.t0
      AND s.first_message_at < b.t1
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  agents AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.avatar_url, '') AS avatar,
      COALESCE(p.max_chats, 5) AS max_chats
    FROM public.profiles p
    WHERE p.is_active IS TRUE
  ),
  open_chats AS (
    -- Só o episódio aberto ocupa capacidade (resolvido/arquivado mantém `assigned_to`).
    SELECT c.assigned_to AS agent_id, count(*) AS n
    FROM public.contacts c
    WHERE c.assigned_to IS NOT NULL
      AND c.conversation_status = 'open'
      AND c.deleted_at IS NULL
    GROUP BY c.assigned_to
  ),
  resolved AS (
    -- Mesma regra do `dashboard_kpi`: DISTINCT contact_id (reabertura no mesmo dia não conta 2x).
    SELECT cc.closed_by AS agent_id, count(DISTINCT cc.contact_id) AS n
    FROM public.conversation_closures cc, bounds b
    WHERE cc.closed_by IS NOT NULL
      AND cc.created_at >= b.t0
      AND cc.created_at < b.t1
    GROUP BY cc.closed_by
  ),
  resp AS (
    SELECT
      c.assigned_to AS agent_id,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (sd.first_response_at - sd.first_message_at))
      ) AS median_seconds
    FROM sla_day sd
    JOIN public.contacts c ON c.id = sd.contact_id
    WHERE sd.first_response_at IS NOT NULL
      AND c.assigned_to IS NOT NULL
    GROUP BY c.assigned_to
  ),
  csat AS (
    SELECT
      cs.agent_id,
      round(100.0 * count(*) FILTER (WHERE cs.rating >= 4) / count(*)) AS satisfaction
    FROM public.csat_surveys cs, bounds b
    WHERE cs.created_at >= b.t0
      AND cs.created_at < b.t1
    GROUP BY cs.agent_id
  ),
  rows AS (
    SELECT
      a.id AS sort_id,
      a.name AS sort_name,
      jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'avatar', a.avatar,
        'maxChats', a.max_chats,
        'activeChats', COALESCE(oc.n, 0),
        'resolvedToday', COALESCE(r.n, 0),
        'avgResponseTime', CASE WHEN rp.median_seconds IS NULL THEN NULL
                                ELSE round(rp.median_seconds)::integer END,
        'satisfaction', CASE WHEN cs.satisfaction IS NULL THEN NULL
                             ELSE cs.satisfaction::integer END
      ) AS row
    FROM agents a
    LEFT JOIN open_chats oc ON oc.agent_id = a.id
    LEFT JOIN resolved r ON r.agent_id = a.id
    LEFT JOIN resp rp ON rp.agent_id = a.id
    LEFT JOIN csat cs ON cs.agent_id = a.id
  )
  SELECT CASE
    WHEN (SELECT is_staff FROM guard)
      THEN COALESCE((SELECT jsonb_agg(row ORDER BY sort_name, sort_id) FROM rows), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$function$;

CREATE OR REPLACE FUNCTION public.warroom_queue_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT public.is_admin_or_supervisor(auth.uid()) AS is_staff
  ),
  ep AS (
    -- Episódio em andamento: resolvido/arquivado não é espera nem atendimento.
    SELECT c.id, c.queue_id, c.assigned_to, c.conversation_status
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
  ),
  sla AS (
    SELECT DISTINCT ON (s.contact_id)
      s.contact_id, s.first_message_at, s.first_response_at,
      s.first_response_breached, s.sla_configuration_id
    FROM public.conversation_sla s
    ORDER BY s.contact_id, s.first_message_at DESC
  ),
  cfg AS (
    SELECT
      sl.contact_id,
      COALESCE(sc.first_response_minutes, def.first_response_minutes) AS first_response_minutes
    FROM sla sl
    LEFT JOIN public.sla_configurations sc ON sc.id = sl.sla_configuration_id
    LEFT JOIN LATERAL (
      SELECT min(dc.first_response_minutes) AS first_response_minutes
      FROM public.sla_configurations dc
      WHERE dc.is_default IS TRUE AND dc.is_active IS TRUE
    ) def ON TRUE
  ),
  agg AS (
    SELECT
      q.id,
      q.name,
      q.color,
      count(e.id) FILTER (WHERE e.assigned_to IS NULL) AS waiting,
      count(e.id) FILTER (WHERE e.assigned_to IS NOT NULL AND e.conversation_status = 'open') AS in_progress,
      count(e.id) FILTER (WHERE sl.first_response_breached IS TRUE) AS breaches,
      count(e.id) FILTER (
        WHERE sl.first_response_at IS NULL
          AND sl.first_response_breached IS NOT TRUE
          AND cf.first_response_minutes IS NOT NULL
          AND now() >= sl.first_message_at + (cf.first_response_minutes * 0.8) * interval '1 minute'
      ) AS warnings,
      count(e.id) FILTER (
        WHERE sl.first_response_at IS NULL AND cf.first_response_minutes IS NOT NULL
      ) AS measurable,
      round(avg(EXTRACT(EPOCH FROM (now() - sl.first_message_at)) / 60.0)
            FILTER (WHERE e.assigned_to IS NULL AND sl.first_message_at IS NOT NULL))::integer AS avg_wait_minutes
    FROM public.queues q
    LEFT JOIN ep e ON e.queue_id = q.id
    LEFT JOIN sla sl ON sl.contact_id = e.id
    LEFT JOIN cfg cf ON cf.contact_id = e.id
    WHERE q.is_active IS TRUE
    GROUP BY q.id, q.name, q.color
  )
  SELECT CASE
    WHEN (SELECT is_staff FROM guard) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'color', a.color,
        'waiting', a.waiting,
        'inProgress', a.in_progress,
        'slaBreaches', a.breaches,
        'slaWarnings', CASE WHEN a.measurable = 0 THEN NULL ELSE a.warnings END,
        'avgWaitTime', a.avg_wait_minutes
      ) ORDER BY a.name, a.id)
      FROM agg a
    ), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$function$;

REVOKE ALL ON FUNCTION public.warroom_agent_today(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.warroom_agent_today(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.warroom_agent_today(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.warroom_queue_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.warroom_queue_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.warroom_queue_stats() TO authenticated, service_role;

COMMENT ON FUNCTION public.warroom_agent_today(date) IS
  'War Room: desempenho do dia (America/Sao_Paulo) por agente ativo — activeChats (episodio aberto), resolvedToday (conversation_closures DISTINCT por contato), avgResponseTime (mediana de 1a resposta do dia via conversation_sla), satisfaction (% de csat_surveys com rating >= 4). Amostra ausente = null, nunca 0.';
COMMENT ON FUNCTION public.warroom_queue_stats() IS
  'War Room: episodio em andamento por fila ativa — waiting, inProgress, slaBreaches (first_response_breached, linha de SLA mais recente por contato) e slaWarnings (sem resposta e >= 80% do prazo de 1a resposta de sla_configurations); sem contato mensuravel, slaWarnings e avgWaitTime vem null.';
