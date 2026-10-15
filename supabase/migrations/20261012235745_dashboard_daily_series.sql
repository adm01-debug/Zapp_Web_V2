-- dashboard_daily_series
-- Rollback: dropa a RPC public.dashboard_daily_series(integer); nao remove dado, coluna, policy, GRANT de outro objeto nem tabela.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.dashboard_daily_series(integer);
--
-- DASHBOARD-03 (paridade V3 -> V2, doc 02-features-batch1): a V3 tem os KPIs
-- diarios de 7 dias (DailyMetricsKpis sobre a view evolution_daily_metrics). A
-- view NAO existe na V2 e NAO deve ser recriada; esta RPC calcula a MESMA serie
-- diaria direto das tabelas operacionais, no fuso de Sao Paulo.
--
-- A serie devolve UMA linha por dia civil de Sao Paulo do periodo [hoje-N+1, hoje],
-- em ordem crescente, incluindo dias sem movimento (contadores = 0). p_days e
-- limitado ao intervalo [1, 90] (mesma trava defensiva de dashboard_hourly_volume).
--
-- Colunas e definicao (espelham evolution_daily_metrics):
--   metric_date                 dia civil (America/Sao_Paulo).
--   messages_received           mensagens com sender='contact' (nao deletadas).
--   messages_sent               mensagens com sender='agent' (nao deletadas).
--   new_contacts                contatos criados no dia (fora os soft-deleted).
--   conversations_opened        contatos cuja PRIMEIRA mensagem (nao deletada) caiu
--                               no dia = conversa iniciada no dia.
--   conversations_resolved      contatos com encerramento no dia (DISTINCT, igual
--                               a resolvedToday/resolvedYesterday de dashboard_kpi:
--                               reabrir/encerrar de novo no mesmo dia conta 1 vez).
--   active_contacts             contatos distintos com mensagem no dia.
--   median_response_time_seconds  mediana (percentile_cont 0.5) de
--                               first_response_at - first_message_at das SLA com
--                               first_message_at no dia; NULL quando nao ha amostra.
--
-- Seguranca: SECURITY DEFINER (o agregado precisa ler TODAS as linhas, sem a RLS do
-- chamador). Por isso a funcao RECUSA quem nao e staff: admin/supervisor (via
-- auth.uid()) ou service_role. authenticated nao-staff leva 42501; anon nao tem
-- EXECUTE. search_path fixo e EXECUTE so para authenticated/service_role.

CREATE OR REPLACE FUNCTION public.dashboard_daily_series(p_days integer DEFAULT 7)
RETURNS TABLE (
  metric_date date,
  messages_received bigint,
  messages_sent bigint,
  new_contacts bigint,
  conversations_opened bigint,
  conversations_resolved bigint,
  active_contacts bigint,
  median_response_time_seconds numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_days      integer     := greatest(least(coalesce(p_days, 7), 90), 1);
  v_today     date        := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start_day date        := v_today - (v_days - 1);
  v_end_day   date        := v_today + 1;
  v_start     timestamptz := (v_start_day::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_end       timestamptz := (v_end_day::timestamp AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'dashboard_daily_series_requires_staff' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(v_start_day, v_today, interval '1 day')::date AS dia
  ),
  recebidas AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.sender = 'contact' AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  enviadas AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.sender = 'agent' AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  ativos AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT m.contact_id) AS c
    FROM public.messages m
    WHERE m.created_at >= v_start AND m.created_at < v_end
      AND m.contact_id IS NOT NULL AND m.is_deleted IS NOT TRUE
    GROUP BY 1
  ),
  abertas AS (
    SELECT (f.primeira AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM (
      SELECT m.contact_id, min(m.created_at) AS primeira
      FROM public.messages m
      WHERE m.created_at >= v_start AND m.created_at < v_end
        AND m.contact_id IS NOT NULL AND m.is_deleted IS NOT TRUE
      GROUP BY m.contact_id
    ) f
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.messages p
      WHERE p.contact_id = f.contact_id
        AND p.is_deleted IS NOT TRUE
        AND p.created_at < v_start
    )
    GROUP BY 1
  ),
  resolvidas AS (
    SELECT (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT cc.contact_id) AS c
    FROM public.conversation_closures cc
    WHERE cc.created_at >= v_start AND cc.created_at < v_end
    GROUP BY 1
  ),
  novos AS (
    SELECT (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS c
    FROM public.contacts c
    WHERE c.created_at >= v_start AND c.created_at < v_end
      AND c.deleted_at IS NULL
    GROUP BY 1
  ),
  resposta AS (
    SELECT (s.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           round(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM (s.first_response_at - s.first_message_at))
           ))::numeric AS mediana
    FROM public.conversation_sla s
    WHERE s.first_message_at >= v_start AND s.first_message_at < v_end
      AND s.first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT dias.dia,
         coalesce(r.c, 0)::bigint,
         coalesce(e.c, 0)::bigint,
         coalesce(n.c, 0)::bigint,
         coalesce(o.c, 0)::bigint,
         coalesce(rs.c, 0)::bigint,
         coalesce(a.c, 0)::bigint,
         m.mediana
  FROM dias
  LEFT JOIN recebidas  r  ON r.dia  = dias.dia
  LEFT JOIN enviadas   e  ON e.dia  = dias.dia
  LEFT JOIN novos      n  ON n.dia  = dias.dia
  LEFT JOIN abertas    o  ON o.dia  = dias.dia
  LEFT JOIN resolvidas rs ON rs.dia = dias.dia
  LEFT JOIN ativos     a  ON a.dia  = dias.dia
  LEFT JOIN resposta   m  ON m.dia  = dias.dia
  ORDER BY dias.dia;
END;
$function$;

COMMENT ON FUNCTION public.dashboard_daily_series(integer) IS
  'Dashboard-03 (2026-10-12): serie diaria dos KPIs de atividade (V3 evolution_daily_metrics) '
  'calculada das tabelas operacionais no fuso de America/Sao_Paulo. SECURITY DEFINER com trava '
  'de papel (admin/supervisor ou service_role); p_days no intervalo [1, 90]; uma linha por dia, '
  'inclusive sem movimento; mediana de resposta NULL quando nao ha amostra na SLA.';

REVOKE ALL ON FUNCTION public.dashboard_daily_series(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_daily_series(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_daily_series(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_daily_series(integer) TO service_role;
