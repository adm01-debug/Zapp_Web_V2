-- get_send_metrics
-- Rollback: tudo desta migration e NOVO (uma funcao), entao o inverso e so dropar a funcao.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.get_send_metrics(timestamptz, uuid);
--
-- AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1 (11/10/2026), faixa C.
-- DEFEITO: o painel de metricas de envio (ChatMonitoringDialog da V3) nao tem
-- numero agregado; sem RPC a tela varreria public.messages inteira (RLS linha a
-- linha) para contar por status, taxa de falha, latencia e erros.
--
-- Esta migration e ADITIVA: cria UMA funcao de leitura agregada e restrita a
-- admin/supervisor. Nao cria tabela, nao muda coluna, nao mexe em RLS/GRANT de
-- objeto existente e nao grava nada. Sem payload, sem telefone e sem texto de
-- mensagem: a funcao devolve apenas contagens, taxas, latencia e o error_code
-- (ja sanitizado pelo produtor em message_attempts).
--
-- Efeitos colaterais: nenhum. Nao ha trigger novo, nao toca messages nem o
-- updated_at de nada, nao publica no realtime e nenhum GRANT/REVOKE muda objeto
-- que ja existia. A unica permissao concedida e EXECUTE a authenticated (para os
-- papeis de leitura) e a service_role; anon e PUBLIC ficam de fora.
--
-- Janela: p_since e limitado a no maximo 30 dias; pedido mais antigo e RECUSADO
-- com erro de parametro (nao truncado silenciosamente), para o painel nunca
-- varrer o historico inteiro.
--
-- Sem dados pessoais: nenhum campo desta funcao guarda ou devolve telefone,
-- texto de mensagem ou payload do provedor.

BEGIN;

-- get_send_metrics: resumo agregado das mensagens enviadas por agente --------
-- SECURITY DEFINER porque soma por cima da RLS de messages; a barreira e o
-- EXECUTE (so authenticated/service_role) + a checagem explicita de papel
-- (is_admin_or_supervisor, que le user_roles) DEPOIS de barrar anon.
CREATE OR REPLACE FUNCTION public.get_send_metrics(
  p_since timestamptz DEFAULT now() - interval '24 hours',
  p_connection_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_send_metrics(timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_send_metrics(timestamptz, uuid)
  TO authenticated, service_role;

COMMIT;
