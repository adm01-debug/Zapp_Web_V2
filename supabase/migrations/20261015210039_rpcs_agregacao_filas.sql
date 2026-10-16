-- rpcs_agregacao_filas
-- Rollback: dropa as 4 RPCs de agregacao de fila. Nenhum dado, tabela, policy, gatilho ou GRANT de objeto existente e tocado.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.queue_comparison(timestamp with time zone, timestamp with time zone);
--   drop function if exists public.queue_analytics_series(uuid, timestamp with time zone, timestamp with time zone);
--   drop function if exists public.queue_waiting_counts();
--   drop function if exists public.queue_contact_message_stats(uuid[]);
--
-- R2-QUE-005/006/007/008 (P1, hooks/business + hooks/queues) -- "agregacoes de fila
-- feitas no navegador, com teto silencioso de 1000 linhas do PostgREST".
--
-- O que existia (branch do dia, evidencia arquivo:linha do cartao):
--   * useQueuesComparison.ts:526-529 lia contacts SEM range -> o PostgREST corta em
--     1000 linhas e a comparacao de filas ficava errada em silencio; :542-552 fazia
--     .in('contact_id', contactIds) com TODOS os contatos em fila (URL estoura) e as
--     mensagens tambem cortavam em 1000; o erro caia no catch :611 so com log.
--   * useQueueAnalytics.ts:257-292 baixava todos os contatos e mensagens da fila para
--     agregar no cliente.
--   * queue.service.ts:24-39 disparava uma consulta HEAD por fila a cada refetch.
--   * useQueueDetails.ts:423-434 baixava TODAS as mensagens dos 50 contatos so para
--     contar e achar a ultima.
--
-- Estas 4 RPCs movem a agregacao para o banco: uma consulta por tela, sem teto de
-- linhas e sem montar IN(...) gigante no cliente.
--
-- SEMANTICA (fonte de verdade a partir daqui):
--   * CONTATO SOFT-DELETADO nao conta em nenhuma metrica (`deleted_at IS NULL`).
--   * Visibilidade = `public.can_edit_contact(assigned_to, queue_id)`, o predicado
--     unico do modulo Contatos (mesma funcao usada nas policies de SELECT/UPDATE de
--     public.contacts, em search_contacts e em delete_contact/delete_contacts desde
--     20260929780000). Como as RPCs sao SECURITY DEFINER, a RLS de public.contacts NAO
--     se aplica dentro delas: esse predicado explicito E' a barreira -- sem ele um
--     agente veria contagem de fila que nao enxerga.
--   * auth.uid() nulo (anon/sem sessao) devolve vazio/0 linhas, nunca dado.
--   * Mensagens passam sempre por um contato visivel (o join com o escopo e' o mesmo
--     funil de `messages_select_policy`).
--   * Nenhuma mensagem e' devolvida: so contagem e o carimbo/id da ultima (nenhum
--     texto de mensagem sai destas RPCs).
--
-- queue_comparison(p_from, p_to) -- p_from/p_to nulos = sem limite de periodo:
--   * totalContacts     = contatos da fila CRIADOS no periodo (nao o total historico);
--   * assignedContacts  = desses, os que ja tem responsavel (MESMO periodo);
--   * totalMessages     = mensagens NO PERIODO dos contatos da fila (MESMO periodo);
--   * avgMessagesPerContact = totalMessages / totalContacts -- os dois no mesmo periodo,
--     que era justamente a mistura denunciada no cartao (media de periodo sobre base
--     historica);
--   * waitingContacts   = snapshot de AGORA (fila aguardando), independente do periodo;
--   * agentsCount       = snapshot de AGORA (membros ATIVOS da fila), visivel so' para
--     admin/supervisor ou membro ativo daquela fila (mesma regua da RLS de queue_members);
--   Filas listadas: `is_active = true`, a mesma regua de useQueuesComparison (@48-50).
--   Vocabulario de "aguardando" identico a queue.service.fetchWaitingCounts: sem
--   responsavel, nao soft-deletado e ainda nao encerrado (resolved/archived).
--
-- queue_analytics_series(p_queue_id, p_from, p_to):
--   * serie DIARIA com todos os dias do periodo preenchidos com zero (generate_series),
--     dia a dia no fuso America/Sao_Paulo (mesmo fuso dos KPIs do Dashboard);
--   * os CTEs novos/mensagens/resolvidos sao pre-filtrados para [dia_inicio, dia_fim+1)
--     no fuso America/Sao_Paulo (predicado direto em created_at): a agregacao nunca
--     varre o historico inteiro da fila, so' a janela pedida;
--   * `from`/`to` no retorno sao o periodo EFETIVO: p_from/p_to nulos = ultimos 30 dias,
--     e a janela e' limitada a 366 dias (a serie nunca e' truncada em silencio).
--
-- queue_waiting_counts(): a espera de TODAS as filas ativas numa consulta (antes era
--   uma consulta HEAD por fila). Devolve fila com zero tambem.
--
-- queue_contact_message_stats(p_contact_ids): contagem + ultima mensagem POR CONTATO
--   (mesmo desenho de get_inbox_contact_summaries, 20261005124628). Contato pedido e
--   NAO visivel nao volta -- nem como zero -- para nao virar oraculo de enumeracao de
--   UUID. Contato visivel e sem mensagem volta com 0/NULL (a lista de fila precisa de
--   linha deterministica por contato; na inbox o cliente descarta conversa vazia, aqui
--   nao ha esse descarte). Desempate da ultima: created_at DESC, id DESC.

CREATE OR REPLACE FUNCTION public.queue_comparison(
  p_from timestamp with time zone DEFAULT NULL,
  p_to   timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH escopo AS MATERIALIZED (
    SELECT c.id, c.queue_id, c.assigned_to, c.created_at
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
  ),
  novos AS (
    SELECT
      e.queue_id,
      count(*) AS total,
      count(*) FILTER (WHERE e.assigned_to IS NOT NULL) AS atribuidos
    FROM escopo e
    WHERE (p_from IS NULL OR e.created_at >= p_from)
      AND (p_to IS NULL OR e.created_at <= p_to)
    GROUP BY e.queue_id
  ),
  aguardando AS (
    SELECT c.queue_id, count(*) AS total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND c.queue_id IS NOT NULL
      AND c.assigned_to IS NULL
      AND c.conversation_status IS DISTINCT FROM 'resolved'
      AND c.conversation_status IS DISTINCT FROM 'archived'
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
    GROUP BY c.queue_id
  ),
  mensagens AS (
    SELECT e.queue_id, count(*) AS total
    FROM public.messages m
    JOIN escopo e ON e.id = m.contact_id
    WHERE (p_from IS NULL OR m.created_at >= p_from)
      AND (p_to IS NULL OR m.created_at <= p_to)
    GROUP BY e.queue_id
  ),
  atendentes AS (
    SELECT qm.queue_id, count(*) AS total
    FROM public.queue_members qm
    WHERE qm.is_active = true
    GROUP BY qm.queue_id
  ),
  linhas AS (
    SELECT
      q.id,
      q.name,
      q.color,
      COALESCE(n.total, 0)::bigint AS total_contatos,
      COALESCE(n.atribuidos, 0)::bigint AS total_atribuidos,
      COALESCE(a.total, 0)::bigint AS total_aguardando,
      COALESCE(m.total, 0)::bigint AS total_mensagens,
      -- Membros ativos so' aparecem para admin/supervisor ou para quem e' membro ativo
      -- daquela fila — a mesma regua da policy SELECT de queue_members
      -- ("Queue members visible to admins or self", 20260410103359). Sem isso a
      -- comparacao entregaria a equipe da fila a quem nao enxerga a fila.
      CASE
        WHEN public.is_admin_or_supervisor((SELECT auth.uid()))
          OR EXISTS (
            SELECT 1
            FROM public.queue_members qm_visivel
            WHERE qm_visivel.queue_id = q.id
              AND qm_visivel.is_active = true
              AND qm_visivel.profile_id = public.get_profile_id_for_user((SELECT auth.uid()))
          )
          THEN COALESCE(t.total, 0)::bigint
        ELSE 0::bigint
      END AS total_atendentes
    FROM public.queues q
    LEFT JOIN novos n ON n.queue_id = q.id
    LEFT JOIN aguardando a ON a.queue_id = q.id
    LEFT JOIN mensagens m ON m.queue_id = q.id
    LEFT JOIN atendentes t ON t.queue_id = q.id
    -- auth.uid() nulo (anon/sem sessao): nenhuma linha. O GRANT tambem fecha anon.
    WHERE q.is_active = true
      AND (SELECT auth.uid()) IS NOT NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'color', l.color,
        'totalContacts', l.total_contatos,
        'assignedContacts', l.total_atribuidos,
        'waitingContacts', l.total_aguardando,
        'totalMessages', l.total_mensagens,
        'avgMessagesPerContact',
          CASE
            WHEN l.total_contatos > 0
              THEN round(l.total_mensagens::numeric / l.total_contatos, 1)
            ELSE 0
          END,
        'agentsCount', l.total_atendentes
      )
      ORDER BY l.total_contatos DESC, l.name ASC, l.id ASC
    ),
    '[]'::jsonb
  )
  FROM linhas l;
$function$;

CREATE OR REPLACE FUNCTION public.queue_analytics_series(
  p_queue_id uuid,
  p_from timestamp with time zone DEFAULT NULL,
  p_to   timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH params AS MATERIALIZED (
    SELECT COALESCE(
             (p_to AT TIME ZONE 'America/Sao_Paulo')::date,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date
           ) AS dia_fim
  ),
  janela AS MATERIALIZED (
    SELECT
      -- Janela de no maximo 366 dias; o periodo efetivo volta em from/to.
      greatest(
        COALESCE((p_from AT TIME ZONE 'America/Sao_Paulo')::date, p.dia_fim - 29),
        p.dia_fim - 365
      ) AS dia_inicio,
      p.dia_fim
    FROM params p
  ),
  dias AS MATERIALIZED (
    SELECT generate_series(j.dia_inicio, j.dia_fim, interval '1 day')::date AS dia
    FROM janela j
    WHERE p_queue_id IS NOT NULL
      AND (SELECT auth.uid()) IS NOT NULL
  ),
  escopo AS MATERIALIZED (
    SELECT c.id, c.created_at, c.conversation_status, c.conversation_status_changed_at
    FROM public.contacts c
    WHERE c.queue_id = p_queue_id
      AND c.deleted_at IS NULL
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
  ),
  novos AS (
    SELECT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS total
    FROM escopo e
    CROSS JOIN janela j
    WHERE e.created_at >= ((j.dia_inicio::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND e.created_at < (((j.dia_fim + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY 1
  ),
  mensagens AS (
    SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS total
    FROM public.messages m
    JOIN escopo e ON e.id = m.contact_id
    CROSS JOIN janela j
    WHERE m.created_at >= ((j.dia_inicio::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND m.created_at < (((j.dia_fim + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY 1
  ),
  resolvidos AS (
    SELECT
      (e.conversation_status_changed_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      count(*) AS total
    FROM escopo e
    CROSS JOIN janela j
    WHERE e.conversation_status = 'resolved'
      AND e.conversation_status_changed_at IS NOT NULL
      AND e.conversation_status_changed_at >= ((j.dia_inicio::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND e.conversation_status_changed_at < (((j.dia_fim + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'queueId', p_queue_id,
    'from', to_char((SELECT dia_inicio FROM janela), 'YYYY-MM-DD'),
    'to', to_char((SELECT dia_fim FROM janela), 'YYYY-MM-DD'),
    'days', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.dia, 'YYYY-MM-DD'),
          'novos', COALESCE(n.total, 0),
          'mensagens', COALESCE(m.total, 0),
          'resolvidos', COALESCE(r.total, 0)
        )
        ORDER BY d.dia ASC
      ),
      '[]'::jsonb
    )
  )
  FROM dias d
  LEFT JOIN novos n ON n.dia = d.dia
  LEFT JOIN mensagens m ON m.dia = d.dia
  LEFT JOIN resolvidos r ON r.dia = d.dia;
$function$;

CREATE OR REPLACE FUNCTION public.queue_waiting_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH aguardando AS (
    SELECT c.queue_id, count(*) AS total
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND c.queue_id IS NOT NULL
      AND c.assigned_to IS NULL
      AND c.conversation_status IS DISTINCT FROM 'resolved'
      AND c.conversation_status IS DISTINCT FROM 'archived'
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
    GROUP BY c.queue_id
  ),
  linhas AS (
    SELECT q.id, q.name, q.priority, COALESCE(a.total, 0)::bigint AS total
    FROM public.queues q
    LEFT JOIN aguardando a ON a.queue_id = q.id
    WHERE q.is_active = true
      AND (SELECT auth.uid()) IS NOT NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('queueId', l.id, 'waiting', l.total)
      ORDER BY l.priority DESC NULLS LAST, l.name ASC, l.id ASC
    ),
    '[]'::jsonb
  )
  FROM linhas l;
$function$;

CREATE OR REPLACE FUNCTION public.queue_contact_message_stats(p_contact_ids uuid[])
RETURNS TABLE (
  contact_id uuid,
  messages_count bigint,
  last_message_id uuid,
  last_message_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH alvo AS MATERIALIZED (
    SELECT DISTINCT t.id AS contact_id
    FROM unnest(p_contact_ids) AS t(id)
    WHERE t.id IS NOT NULL
      AND (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.contacts c
        WHERE c.id = t.id
          AND c.deleted_at IS NULL
          AND public.can_edit_contact(c.assigned_to, c.queue_id)
      )
  ),
  contagem AS (
    SELECT m.contact_id, count(*) AS total
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    GROUP BY m.contact_id
  ),
  ultima AS (
    SELECT DISTINCT ON (m.contact_id) m.contact_id, m.id, m.created_at
    FROM public.messages m
    JOIN alvo a ON a.contact_id = m.contact_id
    ORDER BY m.contact_id, m.created_at DESC, m.id DESC
  )
  SELECT
    alvo.contact_id,
    COALESCE(contagem.total, 0)::bigint AS messages_count,
    ultima.id AS last_message_id,
    ultima.created_at AS last_message_at
  FROM alvo
  LEFT JOIN contagem ON contagem.contact_id = alvo.contact_id
  LEFT JOIN ultima ON ultima.contact_id = alvo.contact_id;
$function$;

REVOKE ALL ON FUNCTION public.queue_comparison(timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_comparison(timestamp with time zone, timestamp with time zone)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.queue_analytics_series(uuid, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_analytics_series(uuid, timestamp with time zone, timestamp with time zone)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.queue_waiting_counts()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_waiting_counts()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.queue_contact_message_stats(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_contact_message_stats(uuid[])
  TO authenticated, service_role;
