-- queue_goal_metrics
-- Rollback: dropa a RPC public.queue_goal_metrics(integer); nao cria tabela, coluna nem dado.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.queue_goal_metrics(integer);
--
-- PARIDADE V3 (batch 2): espelha o rpc_queue_goal_metrics do Zapp Web V3, mas com as
-- definicoes REAIS da V2 (que sao mais corretas em alguns pontos):
--   * aguardando  = mesma definicao de QueueService.fetchWaitingCounts (contacts com
--     queue_id da fila, assigned_to NULL, deleted_at NULL e conversation_status fora de
--     resolved/archived). Nao devolvemos contagem "de fachada" (active_members etc.).
--   * espera media = media de agora - queue_positions.entered_at dos contatos AINDA
--     aguardando na fila (mesma fonte do V3 e do talk_me). Fila sem posicao registrada
--     devolve NULL (ausencia de base, nao um 0 que mente).
--   * taxa de atribuicao = conversas ATRIBUIDAS / conversas RECEBIDAS no periodo
--     (contacts.created_at dentro de p_days); sem base -> NULL, nunca divisao por zero.
--   * mensagens pendentes = mensagens do contato com is_read IS NOT TRUE (nao lidas),
--     nao deletadas.
--   * metas = colunas de queue_goals quando a fila tem meta; NULL quando nao tem.
-- Trava de papel: so admin/supervisor (ou service_role). Agente comum e anon sao negados.
CREATE OR REPLACE FUNCTION public.queue_goal_metrics(p_days integer DEFAULT 7)
RETURNS TABLE(
  queue_id uuid,
  queue_name text,
  waiting_contacts bigint,
  avg_wait_minutes numeric,
  assignment_rate numeric,
  messages_pending bigint,
  max_waiting_contacts integer,
  max_avg_wait_minutes integer,
  min_assignment_rate integer,
  max_messages_pending integer,
  alerts_enabled boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_supervisor(auth.uid())
    OR coalesce(auth.role(), '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'queue_goal_metrics: acesso restrito a admin/supervisor'
      USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'queue_goal_metrics: periodo invalido (1..365 dias)'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH waiting AS (
    SELECT c.queue_id AS qid, count(*)::bigint AS total
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.assigned_to IS NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
    GROUP BY c.queue_id
  ),
  wait_time AS (
    SELECT qp.queue_id AS qid,
           round(avg(extract(epoch FROM (now() - coalesce(qp.entered_at, qp.created_at))) / 60.0)::numeric, 1)
             AS media
    FROM public.queue_positions qp
    JOIN public.contacts c ON c.id = qp.contact_id
    WHERE c.queue_id = qp.queue_id
      AND c.assigned_to IS NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
      AND coalesce(qp.entered_at, qp.created_at) IS NOT NULL
    GROUP BY qp.queue_id
  ),
  received AS (
    SELECT c.queue_id AS qid, count(*)::bigint AS total
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.created_at > now() - make_interval(days => p_days)
    GROUP BY c.queue_id
  ),
  assigned AS (
    SELECT c.queue_id AS qid, count(*)::bigint AS total
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.assigned_to IS NOT NULL
      AND c.created_at > now() - make_interval(days => p_days)
    GROUP BY c.queue_id
  ),
  pending AS (
    SELECT c.queue_id AS qid, count(*)::bigint AS total
    FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND m.sender = 'contact'
      AND m.is_read IS NOT TRUE
      AND coalesce(m.is_deleted, false) = false
    GROUP BY c.queue_id
  )
  SELECT q.id,
         q.name,
         coalesce(w.total, 0)::bigint,
         wt.media,
         CASE WHEN coalesce(r.total, 0) > 0
              THEN round(100.0 * coalesce(a.total, 0) / r.total, 1)
              ELSE NULL
         END,
         coalesce(pd.total, 0)::bigint,
         g.max_waiting_contacts,
         g.max_avg_wait_minutes,
         g.min_assignment_rate,
         g.max_messages_pending,
         g.alerts_enabled
  FROM public.queues q
  LEFT JOIN waiting w   ON w.qid = q.id
  LEFT JOIN wait_time wt ON wt.qid = q.id
  LEFT JOIN received r  ON r.qid = q.id
  LEFT JOIN assigned a  ON a.qid = q.id
  LEFT JOIN pending pd  ON pd.qid = q.id
  LEFT JOIN public.queue_goals g ON g.queue_id = q.id
  WHERE q.is_active
  ORDER BY q.name, q.id;
END;
$$;

COMMENT ON FUNCTION public.queue_goal_metrics(integer) IS
  'Metricas reais por fila (aguardando, espera media, taxa de atribuicao, mensagens pendentes) + metas configuradas. Admin/supervisor apenas.';

-- Permissao pela assinatura exata; PUBLIC/anon nunca chamam.
REVOKE ALL ON FUNCTION public.queue_goal_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_goal_metrics(integer) TO authenticated, service_role;
