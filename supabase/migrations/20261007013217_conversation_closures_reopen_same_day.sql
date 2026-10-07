-- conversation_closures_reopen_same_day
-- Rollback: recria o indice conversation_closures_contact_day_uidx (consolidando os repetidos do dia) e devolve dashboard_kpi ao corpo anterior; o SQL esta em "Rollback (completo)" abaixo.
--
-- R2-DB-008 / item 295 (P2) — "Indice de um fechamento por dia impede encerrar
-- novamente uma conversa reaberta".
--
-- A migration 20260927590000 criou public.conversation_closures_contact_day_uidx
-- (contact_id, conversation_closure_day(created_at)) para deduplicar historico e
-- indicadores. Só que o indice mora na TABELA OPERACIONAL: a FSM vigente permite
-- resolved -> open (reabrir) e o contrato da RPC public.close_conversation_atomic
-- aceita um encerramento novo com client_request_id novo. No mesmo dia de Sao
-- Paulo, esse segundo encerramento batia no indice (23505), a transacao inteira
-- era desfeita e a conversa reaberta NAO encerrava de novo (nada ficava pela
-- metade, mas o caminho era impossivel). O INSERT direto do auto-close
-- (supabase/functions/auto-close-conversations, client_request_id NULL) caia no
-- mesmo indice.
--
-- Correcao: separar as duas coisas.
--   (1) A unicidade OPERACIONAL da solicitacao continua garantida pelo indice
--       public.ux_conversation_closures_contact_request (contact_id,
--       client_request_id, WHERE client_request_id IS NOT NULL), criado em
--       20260909220000 — o indice diario (deduplicacao de indicador) sai.
--   (2) A deduplicacao diaria passa a ser feita na LEITURA dos indicadores, que e
--       onde ela pertence: resolvedToday/resolvedYesterday ja contam
--       count(DISTINCT contact_id); aqui o resolved_hourly de public.dashboard_kpi
--       passa a contar tambem UMA vez por contato/dia (no horario do primeiro
--       encerramento do dia), que era o numero que o indice garantia antes.
--
-- Nenhum GRANT, papel, policy ou coluna muda; nenhum dado e apagado por esta
-- migration. O evento 'close' de cada encerramento continua em
-- public.conversation_events (closure_id), e a gamificacao
-- (handle_conversation_closure_gamification) segue contando cada encerramento.
--
-- Rollback (completo):
--   -- 1) volta o indice unico diario, consolidando os fechamentos repetidos do mesmo
--   --    dia e mantendo o mais antigo (mesma regra de 20260927590000). ATENCAO: os
--   --    fechamentos apagados perdem o evento 'close' por ON DELETE CASCADE
--   --    (conversation_events.closure_id) — rode com o sistema parado e com backup.
--   delete from public.conversation_closures a using public.conversation_closures b
--     where a.contact_id = b.contact_id
--       and public.conversation_closure_day(a.created_at) = public.conversation_closure_day(b.created_at)
--       and (a.created_at, a.id) > (b.created_at, b.id);
--   create unique index if not exists conversation_closures_contact_day_uidx
--     on public.conversation_closures (contact_id, public.conversation_closure_day(created_at));
--   -- 2) volta a definicao vigente de dashboard_kpi (corpo canonico, copiado byte a byte
--   --    de 20261003272707_reconcile_local_replay_with_canonical.sql):
--   CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone DEFAULT (now() - '1 day'::interval), p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
--    RETURNS jsonb
--    LANGUAGE plpgsql
--    STABLE
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_today     date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
--     v_yesterday date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
--     v_is_staff  boolean := public.is_admin_or_supervisor(auth.uid());
--     v_result    jsonb;
--   BEGIN
--     IF NOT v_is_staff THEN
--       p_agent := public.get_profile_id_for_user(auth.uid());
--     END IF;
--   
--     WITH closures AS (
--       SELECT
--         (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
--         extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
--         cc.contact_id
--       FROM public.conversation_closures cc
--       JOIN public.contacts ct ON ct.id = cc.contact_id
--       WHERE (p_since IS NULL OR cc.created_at >= p_since)
--         AND (p_queue IS NULL OR ct.queue_id = p_queue)
--         AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
--     ),
--     sla_rows AS (
--       SELECT
--         (cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
--         extract(hour FROM cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
--         cs.first_response_at,
--         extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds,
--         cs.first_response_breached
--       FROM public.conversation_sla cs
--       JOIN public.contacts ct ON ct.id = cs.contact_id
--       WHERE (p_since IS NULL OR cs.first_message_at >= p_since)
--         AND (p_queue IS NULL OR ct.queue_id = p_queue)
--         AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
--     ),
--     resolved_hourly AS (
--       SELECT least(7, hour / 3) AS bucket, count(*) AS c
--       FROM closures WHERE day = v_today GROUP BY 1
--     ),
--     answered_today AS (
--       SELECT response_seconds
--       FROM sla_rows
--       WHERE day = v_today AND first_response_at IS NOT NULL
--     ),
--     answered_yesterday AS (
--       SELECT response_seconds
--       FROM sla_rows
--       WHERE day = v_yesterday AND first_response_at IS NOT NULL
--     ),
--     response_hourly AS (
--       SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
--       FROM sla_rows
--       WHERE day = v_today AND first_response_at IS NOT NULL
--       GROUP BY 1
--     )
--     SELECT jsonb_build_object(
--       'resolvedToday',        (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_today),
--       'resolvedYesterday',    (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_yesterday),
--       'resolvedHourly8',      (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
--                                 FROM generate_series(0, 7) g(b)
--                                 LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
--       'avgResponseToday',     (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
--                                 FROM answered_today),
--       'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
--                                 FROM answered_yesterday),
--       'p90ResponseToday',     (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
--                                 FROM answered_today),
--       'responseHourly8',      (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
--                                 FROM generate_series(0, 7) g(b)
--                                 LEFT JOIN response_hourly rh ON rh.bucket = g.b),
--       'slaBreachedToday',     (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
--       'answeredTodayCount',   (SELECT count(*) FROM answered_today),
--       'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
--     ) INTO v_result;
--   
--     RETURN v_result;
--   END;
--   $function$;

-- Sem BEGIN/COMMIT: a migration roda numa unica transacao (hermes-db-migrar).

-- (1) O indice diario da tabela operacional sai. A idempotencia da solicitacao
--     segue no indice ux_conversation_closures_contact_request.
DROP INDEX IF EXISTS public.conversation_closures_contact_day_uidx;

-- (2) Indicadores: deduplicacao diaria passa a ser da leitura.
CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone DEFAULT (now() - '1 day'::interval), p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_is_staff  boolean := public.is_admin_or_supervisor(auth.uid());
  v_result    jsonb;
BEGIN
  IF NOT v_is_staff THEN
    p_agent := public.get_profile_id_for_user(auth.uid());
  END IF;

  WITH closures AS (
    SELECT
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cc.contact_id
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE (p_since IS NULL OR cc.created_at >= p_since)
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
    WHERE (p_since IS NULL OR cs.first_message_at >= p_since)
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  resolved_hourly AS (
    -- Varios encerramentos do MESMO contato no mesmo dia contam UMA vez, no
    -- horario do primeiro do dia: era exatamente o que o indice unico diario
    -- (removido nesta migration) garantia para os indicadores.
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM (
      SELECT DISTINCT ON (contact_id) hour
      FROM closures
      WHERE day = v_today
      ORDER BY contact_id, hour
    ) AS first_closure_of_day
    GROUP BY 1
  ),
  answered_today AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
  ),
  answered_yesterday AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_yesterday AND first_response_at IS NOT NULL
  ),
  response_hourly AS (
    SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday',        (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_today),
    'resolvedYesterday',    (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_yesterday),
    'resolvedHourly8',      (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday',     (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_yesterday),
    'p90ResponseToday',     (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'responseHourly8',      (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday',     (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
    'answeredTodayCount',   (SELECT count(*) FROM answered_today),
    'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
