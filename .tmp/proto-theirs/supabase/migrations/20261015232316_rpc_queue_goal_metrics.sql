-- rpc_queue_goal_metrics
-- Rollback: dropa a RPC public.rpc_queue_goal_metrics(); nao cria tabela, coluna, indice,
-- Rollback: policy, trigger nem dado, e nao concede acesso a nenhum objeto que ja existia.
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.rpc_queue_goal_metrics();
--
-- PARIDADE V3 (docs/estado/24-hooks-raiz-2.md, 2a passada): a V3 alimenta os alertas de
-- 50/75/100 % dos limites de fila com o rpc_queue_goal_metrics. A V2 nao tinha a RPC e a
-- "taxa de atribuicao" era inventada na tela (membros ativos / (esperando + ativos)).
-- Aqui a RPC nasce com as definicoes REAIS da V2 (a V2 e a fonte da verdade):
--   * conversas abertas = contacts da fila com deleted_at IS NULL e conversation_status
--     fora de 'resolved'/'archived' (mesma definicao que a caixa de entrada usa).
--   * aguardando = conversas abertas da fila com assigned_to IS NULL.
--   * espera media = queue_positions dos contatos AINDA aguardando: minutos desde
--     entered_at; quando a fila nao registrou o instante de entrada, usa a estimativa da
--     propria fila (estimated_wait_minutes). Sem nenhuma posicao -> NULL.
--   * taxa de atribuicao (janela de 7 dias) = contactos RECEBIDOS na fila no periodo vs
--     eventos reais de atribuicao em conversation_events ('assign'/'unassign'): so conta
--     como atribuido o contato cujo ULTIMO evento da janela e 'assign' (quem foi
--     desatribuido por ultimo nao infla a taxa). Sem contato recebido -> NULL (nunca 0).
--     O cartao pede "unread_count das conversas abertas"; a V2 nao tem coluna unread_count
--     (a V3 tem) - o equivalente da V2 e o indice parcial idx_messages_unread_contact
--     (sender='contact' AND is_read=false), usado aqui, sem mensagem apagada.
--   * 0 e dado; NULL e "sem base": fila sem NENHUM contato devolve as metricas NULL e
--     coverage='sem_base'. Fila com contato mas sem posicao de espera / sem recebido no
--     periodo devolve coverage='parcial' e so a metrica sem base em NULL.
--   * coverage: 'sem_base' | 'parcial' | 'completa'.
-- Visibilidade (cartao): staff (admin/supervisor) ve todas as filas ativas; qualquer outro
-- perfil autenticado ve apenas as filas de que e membro ativo (queue_members). Quem nao e
-- staff nem membro recebe ZERO linhas - nao ha oraculo de fila alheia.
-- As metas (queue_goals) NAO entram aqui: o painel ja le queue_goals direto; o cartao pede
-- as metricas + coverage.
CREATE OR REPLACE FUNCTION public.rpc_queue_goal_metrics()
RETURNS TABLE(
  queue_id uuid,
  queue_name text,
  coverage text,
  contacts_open bigint,
  waiting_contacts bigint,
  avg_wait_minutes numeric,
  assignment_rate numeric,
  received_contacts bigint,
  assigned_contacts bigint,
  messages_pending bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH visible AS (
    SELECT q.id, q.name
    FROM public.queues q
    WHERE q.is_active
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.queue_members qm
          WHERE qm.queue_id = q.id
            AND qm.is_active
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
        )
      )
  ),
  base AS (
    SELECT c.queue_id AS qid,
           count(*) AS all_total,
           count(*) FILTER (
             WHERE c.conversation_status NOT IN ('resolved', 'archived')
           ) AS open_total,
           count(*) FILTER (
             WHERE c.conversation_status NOT IN ('resolved', 'archived')
               AND c.assigned_to IS NULL
           ) AS waiting_total
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
    GROUP BY c.queue_id
  ),
  wait_time AS (
    SELECT qp.queue_id AS qid,
           round(
             avg(
               CASE
                 WHEN qp.entered_at IS NOT NULL
                   THEN extract(epoch FROM (now() - qp.entered_at)) / 60.0
                 ELSE qp.estimated_wait_minutes::numeric
               END
             ),
             1
           ) AS media
    FROM public.queue_positions qp
    JOIN public.contacts c ON c.id = qp.contact_id
    WHERE c.queue_id = qp.queue_id
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
      AND c.assigned_to IS NULL
    GROUP BY qp.queue_id
  ),
  received AS (
    SELECT c.queue_id AS qid,
           count(*) AS total
    FROM public.contacts c
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.created_at > now() - interval '7 days'
    GROUP BY c.queue_id
  ),
  last_ev AS (
    SELECT DISTINCT ON (ce.contact_id)
           ce.contact_id,
           ce.event_type
    FROM public.conversation_events ce
    WHERE ce.event_type IN ('assign', 'unassign')
      AND ce.created_at > now() - interval '7 days'
    ORDER BY ce.contact_id, ce.created_at DESC, ce.id DESC
  ),
  assigned AS (
    SELECT c.queue_id AS qid,
           count(*) AS total
    FROM public.contacts c
    JOIN last_ev e ON e.contact_id = c.id AND e.event_type = 'assign'
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.created_at > now() - interval '7 days'
    GROUP BY c.queue_id
  ),
  pending AS (
    SELECT c.queue_id AS qid,
           count(*) AS total
    FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE c.queue_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.conversation_status NOT IN ('resolved', 'archived')
      AND m.sender = 'contact'
      AND m.is_read = false
      AND coalesce(m.is_deleted, false) = false
    GROUP BY c.queue_id
  )
  SELECT v.id,
         v.name,
         CASE
           WHEN b.qid IS NULL THEN 'sem_base'
           WHEN wt.media IS NOT NULL
                AND coalesce(r.total, 0) > 0 THEN 'completa'
           ELSE 'parcial'
         END,
         CASE WHEN b.qid IS NULL THEN NULL ELSE b.open_total END,
         CASE WHEN b.qid IS NULL THEN NULL ELSE b.waiting_total END,
         wt.media,
         CASE
           WHEN coalesce(r.total, 0) > 0
             THEN round(100.0 * coalesce(a.total, 0) / r.total, 1)
           ELSE NULL
         END,
         CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(r.total, 0) END,
         CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(a.total, 0) END,
         CASE WHEN b.qid IS NULL THEN NULL ELSE coalesce(p.total, 0) END
  FROM visible v
  LEFT JOIN base b ON b.qid = v.id
  LEFT JOIN wait_time wt ON wt.qid = v.id
  LEFT JOIN received r ON r.qid = v.id
  LEFT JOIN assigned a ON a.qid = v.id
  LEFT JOIN pending p ON p.qid = v.id
  ORDER BY v.name, v.id;
$function$;

COMMENT ON FUNCTION public.rpc_queue_goal_metrics() IS
  'Metricas reais por fila (conversas abertas, aguardando, espera media, taxa de atribuicao em 7 dias, mensagens pendentes) + coverage. NULL = sem base. Visivel a staff ou membro ativo da fila.';

-- Permissao pela assinatura exata e so para quem o cartao manda: `authenticated`.
-- PUBLIC, anon e service_role nunca chamam (o papel entrou no REVOKE para nao ficar com
-- acesso implicito herdado de PUBLIC).
REVOKE ALL ON FUNCTION public.rpc_queue_goal_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_queue_goal_metrics() TO authenticated;
