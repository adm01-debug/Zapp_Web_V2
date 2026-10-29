-- ops_metrics_rpc
-- Rollback: dropa a RPC public.ops_metrics(integer) e seus grants/comentario.
-- Rollback (SQL executavel, na ordem):
--   revoke all on function public.ops_metrics(integer) from public, anon, authenticated;
--   drop function if exists public.ops_metrics(integer);
--
-- Metricas operacionais para o painel de Operacoes (item de banco XPTO):
-- volume de ENTRADA/SAIDA/FALHA por conexao de WhatsApp e ESPERA (media e p95)
-- por fila, tudo dentro de uma janela movel de horas.
--
-- Somente ADITIVO: cria a funcao public.ops_metrics(p_window_hours integer).
-- Nao altera tabela, coluna, policy, dado nem grant existente.
--
-- Fontes (leituras, sem escrita):
--   * volume   -> public.messages agrupado por whatsapp_connection_id;
--                 entrada = sender 'contact'; saida = sender 'agent';
--                 falha   = sender 'agent' AND status 'failed'.
--   * espera   -> public.conversation_sla: first_response_at - first_message_at
--                 (segundos) por fila (contacts.queue_id), apenas conversas
--                 iniciadas na janela e ja respondidas.
--
-- Permissao: RPC de leitura gerencial. Chamador precisa ser staff
-- (public.is_admin_or_supervisor(auth.uid())); agente comum recebe 42501.
-- EXECUTE negado a PUBLIC e anon, concedido apenas a authenticated (a checagem
-- de staff acontece dentro da funcao). SECURITY DEFINER com search_path fixo.
--
-- Janelas permitidas: 24, 168 e 720 horas (default 24); qualquer outro valor
-- levanta 22023 (invalid_window_hours).

CREATE OR REPLACE FUNCTION public.ops_metrics(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_since timestamptz;
  v_connections jsonb;
  v_queues jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'staff_required' USING ERRCODE = '42501';
  END IF;

  IF p_window_hours IS NULL OR p_window_hours NOT IN (24, 168, 720) THEN
    RAISE EXCEPTION 'invalid_window_hours' USING ERRCODE = '22023';
  END IF;

  v_since := statement_timestamp() - make_interval(hours => p_window_hours);

  SELECT COALESCE(jsonb_agg(to_jsonb(conn) ORDER BY conn.incoming + conn.outgoing DESC, conn.connection_id), '[]'::jsonb)
    INTO v_connections
  FROM (
    SELECT
      m.whatsapp_connection_id AS connection_id,
      wc.name AS connection_name,
      count(*) FILTER (WHERE m.sender = 'contact')::bigint AS incoming,
      count(*) FILTER (WHERE m.sender = 'agent')::bigint AS outgoing,
      count(*) FILTER (WHERE m.sender = 'agent' AND m.status = 'failed')::bigint AS failed
    FROM public.messages AS m
    LEFT JOIN public.whatsapp_connections AS wc ON wc.id = m.whatsapp_connection_id
    WHERE m.created_at >= v_since
      AND COALESCE(m.is_deleted, false) = false
    GROUP BY m.whatsapp_connection_id, wc.name
  ) AS conn;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.avg_wait_seconds DESC NULLS LAST, q.queue_id), '[]'::jsonb)
    INTO v_queues
  FROM (
    SELECT
      c.queue_id,
      q.name AS queue_name,
      count(*)::bigint AS answered,
      round(avg(extract(epoch FROM (sla.first_response_at - sla.first_message_at)))::numeric, 2) AS avg_wait_seconds,
      round(percentile_cont(0.95) WITHIN GROUP (
        ORDER BY extract(epoch FROM (sla.first_response_at - sla.first_message_at))
      )::numeric, 2) AS p95_wait_seconds
    FROM public.conversation_sla AS sla
    JOIN public.contacts AS c ON c.id = sla.contact_id
    JOIN public.queues AS q ON q.id = c.queue_id
    WHERE sla.first_message_at >= v_since
      AND sla.first_response_at IS NOT NULL
      AND c.queue_id IS NOT NULL
    GROUP BY c.queue_id, q.name
  ) AS q;

  RETURN jsonb_build_object(
    'window_hours', p_window_hours,
    'since', v_since,
    'connections', v_connections,
    'queues', v_queues
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ops_metrics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_metrics(integer) TO authenticated;

COMMENT ON FUNCTION public.ops_metrics(integer) IS
  'Operacoes (2026-10-15): metricas da janela movel de p_window_hours (24/168/720, default 24). '
  'Devolve {window_hours, since, connections:[{connection_id, connection_name, incoming, outgoing, failed}], '
  'queues:[{queue_id, queue_name, answered, avg_wait_seconds, p95_wait_seconds}]}. '
  'Volume por conexao vem de messages (entrada=sender contact, saida=sender agent, falha=agent+status failed, '
  'sem deletadas); espera por fila vem de conversation_sla (first_response_at - first_message_at, segundos), '
  'apenas conversas iniciadas na janela e ja respondidas. SECURITY DEFINER, search_path fixo, staff-only '
  '(is_admin_or_supervisor); EXECUTE fechado a PUBLIC/anon.';
