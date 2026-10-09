-- sla_first_response_delivery_timestamp
-- Rollback: restaure a definicao anterior do trigger, que usava o created_at da
--           mensagem como instante da resposta:
--             CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
--             RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
--             AS $$ BEGIN
--               PERFORM public.register_first_response_internal(NEW.contact_id, NEW.created_at, NEW.created_at);
--               RETURN NULL;
--             END; $$;
--
-- R2-SLA-004 (P2) — "Marco de medicao do SLA omite o tempo entre criacao e envio".
--
-- O trigger de primeira resposta (20260903225000_sla_first_response_v2.sql) roda
-- quando a mensagem do atendente chega a status 'sent', mas passava NEW.created_at
-- como p_responded_at. Mensagem e criada no enqueue em 'sending' e so vira 'sent'
-- depois da entrega ao provedor (message-delivery -> complete_outbound_message, que
-- grava status_updated_at = statement_timestamp()). Uma mensagem criada aos 4 min e
-- confirmada aos 10 min entrava no SLA como resposta aos 4 min e nao estourava o
-- prazo — o tempo em fila/retentativa ficava fora da medida.
--
-- Correcao: o instante da resposta passa a ser status_updated_at (o momento em que o
-- status virou 'sent', setado por complete_outbound_message e pelos handlers de
-- webhook em whatsapp-webhook/evolution-webhook-*), com o created_at como fallback
-- apenas quando a coluna estiver nula. O p_before_created_at continua sendo o
-- created_at, que e a fronteira para achar a resposta ANTERIOR por ordem de criacao.
--
-- status_updated_at existe desde 20251220150341_7b912e89-f6bc-4210-9bfb-938ae90e5cf4.sql
-- (ADD COLUMN ... DEFAULT now()) e e gravada em todo caminho de envio.

CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Instante da resposta = quando a mensagem EFETIVAMENTE saiu (status sent),
  -- nao quando foi criada. O created_at segue como fronteira de ordenacao.
  PERFORM public.register_first_response_internal(
    NEW.contact_id,
    coalesce(NEW.status_updated_at, NEW.created_at),
    NEW.created_at
  );
  RETURN NULL;
END;
$$;
