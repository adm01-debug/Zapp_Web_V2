-- valida_fila_destino_bulk_transfer
-- Rollback: executar integralmente o bloco SQL comentado abaixo, até -- End Rollback.
-- DROP TRIGGER IF EXISTS trg_validate_bulk_transfer_queue_destination ON public.contacts;
-- DROP FUNCTION IF EXISTS public.validate_bulk_transfer_queue_destination();
-- End Rollback

-- A RPC já exige associação ativa do operador para filas existentes. Administradores
-- legitimamente não precisam dessa associação, mas o atalho administrativo da função
-- anterior também deixava uma fila inexistente chegar à FK, produzindo erro técnico.
-- Este trigger participa somente da transação marcada pela RPC e converte esse caso no
-- mesmo erro de domínio, antes de qualquer UPDATE. Qualquer exceção desfaz o lote todo.
CREATE OR REPLACE FUNCTION public.validate_bulk_transfer_queue_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.bulk_transfer_contacts', true) = 'on'
     AND NEW.queue_id IS DISTINCT FROM OLD.queue_id
     AND NEW.queue_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.queues q
        WHERE q.id = NEW.queue_id
     ) THEN
    RAISE EXCEPTION 'Fila de destino invalida ou sem permissao.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_bulk_transfer_queue_destination()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_bulk_transfer_queue_destination ON public.contacts;
CREATE TRIGGER trg_validate_bulk_transfer_queue_destination
BEFORE UPDATE OF queue_id ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.validate_bulk_transfer_queue_destination();
