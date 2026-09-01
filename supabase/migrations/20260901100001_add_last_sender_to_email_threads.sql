-- add_last_sender_to_email_threads
-- Adiciona colunas last_from_name e last_from_address em email_threads
-- e trigger que as mantém sincronizadas com a mensagem mais recente.

ALTER TABLE public.email_threads
  ADD COLUMN last_from_name    TEXT,
  ADD COLUMN last_from_address TEXT;

CREATE OR REPLACE FUNCTION public.sync_thread_last_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_latest RECORD;
BEGIN
  -- Busca a mensagem mais recente da thread (O(1) com índice idx_email_messages_thread_date)
  SELECT from_name, from_address
    INTO v_latest
    FROM public.email_messages
   WHERE thread_id = NEW.thread_id
   ORDER BY internal_date DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.email_threads
       SET last_from_name    = v_latest.from_name,
           last_from_address = v_latest.from_address
     WHERE id = NEW.thread_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_thread_last_sender
  AFTER INSERT OR UPDATE OF from_name, from_address, internal_date
  ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION sync_thread_last_sender();
