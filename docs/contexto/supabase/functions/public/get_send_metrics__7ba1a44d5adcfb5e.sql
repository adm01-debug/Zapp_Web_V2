CREATE OR REPLACE FUNCTION public.get_send_metrics(p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval), p_connection_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_since timestamptz := COALESCE(p_since, now() - interval '24 hours');
  v_floor timestamptz := now() - interval '30 days';
BEGIN
  -- So admin ou supervisor. Agente comum e anon recebem erro de permissao.
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  -- Janela maxima de 30 dias (recusa, nao trunca).
  IF v_since < v_floor THEN
    RAISE EXCEPTION 'period_too_wide: p_since must be within the last 30 days'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'since', v_since,
    'until', now(),

    -- Totais por status das mensagens de saida (sender='agent') no periodo.
    'totals', (
      SELECT jsonb_build_object(
        'sending',   count(*) FILTER (WHERE m.status = 'sending'),
        'sent',      count(*) FILTER (WHERE m.status = 'sent'),
        'delivered', count(*) FILTER (WHERE m.status = 'delivered'),
        'read',      count(*) FILTER (WHERE m.status = 'read'),
        'failed',    count(*) FILTER (WHERE m.status = 'failed'),
        'total',     count(*)
      )
      FROM public.messages AS m
      WHERE m.sender = 'agent'
        AND m.created_at >= v_since
        AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
    ),

    -- Taxa de falha (0..1), 4 casas. Zero quando nao ha mensagem no periodo.
    'failure_rate', (
      SELECT CASE WHEN count(*) = 0 THEN 0
             ELSE round(count(*) FILTER (WHERE m.status = 'failed')::numeric
                        / count(*), 4)
             END
      FROM public.messages AS m
      WHERE m.sender = 'agent'
        AND m.created_at >= v_since
        AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
    ),

    -- Media de tentativas por mensagem (delivery_attempt_count).
    'avg_attempts', (
      SELECT COALESCE(round(avg(m.delivery_attempt_count)::numeric, 2), 0)
      FROM public.messages AS m
      WHERE m.sender = 'agent'
        AND m.created_at >= v_since
        AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
    ),

    -- Latencia p95 de envio (ms): status_updated_at - created_at das enviadas.
    'latency_p95_ms', (
      SELECT round(
               percentile_cont(0.95) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (m.status_updated_at - m.created_at)) * 1000
               )::numeric, 1)
      FROM public.messages AS m
      WHERE m.sender = 'agent'
        AND m.created_at >= v_since
        AND m.status_updated_at IS NOT NULL
        AND m.status IN ('sent', 'delivered', 'read')
        AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
    ),

    -- Top 10 error_code das tentativas de envio no periodo (contagem).
    'top_errors', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('error_code', e.error_code, 'count', e.count)
          ORDER BY e.count DESC, e.error_code
        ), '[]'::jsonb)
      FROM (
        SELECT a.error_code, count(*) AS count
        FROM public.message_attempts AS a
        JOIN public.messages AS m ON m.id = a.message_id
        WHERE a.error_code IS NOT NULL
          AND a.created_at >= v_since
          AND m.sender = 'agent'
          AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
        GROUP BY a.error_code
        ORDER BY count(*) DESC, a.error_code
        LIMIT 10
      ) AS e
    ),

    -- Quebra por conexao: id e nome, NUNCA telefone.
    'by_connection', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'connection_id', c.connection_id,
            'connection_name', c.connection_name,
            'total', c.total,
            'failed', c.failed
          ) ORDER BY c.total DESC, c.connection_id
        ), '[]'::jsonb)
      FROM (
        SELECT m.whatsapp_connection_id AS connection_id,
               wc.name AS connection_name,
               count(*) AS total,
               count(*) FILTER (WHERE m.status = 'failed') AS failed
        FROM public.messages AS m
        LEFT JOIN public.whatsapp_connections AS wc
          ON wc.id = m.whatsapp_connection_id
        WHERE m.sender = 'agent'
          AND m.created_at >= v_since
          AND (p_connection_id IS NULL OR m.whatsapp_connection_id = p_connection_id)
        GROUP BY m.whatsapp_connection_id, wc.name
        ORDER BY count(*) DESC, m.whatsapp_connection_id
      ) AS c
    )
  );
END;
$function$
