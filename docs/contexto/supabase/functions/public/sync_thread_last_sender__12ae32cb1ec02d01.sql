CREATE OR REPLACE FUNCTION public.sync_thread_last_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
