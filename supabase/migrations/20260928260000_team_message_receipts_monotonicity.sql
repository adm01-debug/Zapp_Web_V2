-- E11: Garantir monotonicity em team_message_receipts + REVOKE DELETE
-- status nao pode regredir (undelivered -> delivered -> read; nunca o inverso)
-- DELETE de recibo nao deve ser permitido (auditoria)

REVOKE DELETE ON TABLE public.team_message_receipts FROM anon, authenticated;

-- Funcao de validacao de monotonicity
CREATE OR REPLACE FUNCTION public.team_message_receipts_monotonicity_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nao permitir regressao de status
  IF OLD.status = 'read' AND NEW.status != 'read' THEN
    RAISE EXCEPTION 'team_message_receipts: status nao pode regredir de read para %', NEW.status;
  END IF;
  IF OLD.status = 'delivered' AND NEW.status = 'sent' THEN
    RAISE EXCEPTION 'team_message_receipts: status nao pode regredir de delivered para sent';
  END IF;
  -- Garantir que delivered_at e read_at nao sejam apagados
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS NULL THEN
    RAISE EXCEPTION 'team_message_receipts: delivered_at nao pode ser removido';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS NULL THEN
    RAISE EXCEPTION 'team_message_receipts: read_at nao pode ser removido';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_message_receipts_monotonicity_check() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS team_message_receipts_monotonicity ON public.team_message_receipts;

CREATE TRIGGER team_message_receipts_monotonicity
  BEFORE UPDATE ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_message_receipts_monotonicity_check();
