-- ledger-divergence/version-collision: ancora para excecao de 20260927510000.
-- O SQL abaixo e idempotente (CREATE OR REPLACE): apenas re-declara a funcao/trigger
-- ja existente desde 20260927421000. Nao muda nada em producao.
CREATE OR REPLACE FUNCTION public.sync_contact_status_on_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.contacts
  SET conversation_status = 'resolved'
  WHERE id = NEW.contact_id
    AND conversation_status IS DISTINCT FROM 'resolved';
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE TRIGGER trg_sync_contact_status_on_closure
  AFTER INSERT ON public.conversation_closures
  FOR EACH ROW EXECUTE FUNCTION sync_contact_status_on_closure();
