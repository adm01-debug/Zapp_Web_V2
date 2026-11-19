CREATE OR REPLACE FUNCTION public.reject_repeated_conversation_closure_without_reopen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_status_changed_at timestamptz;
  v_last_closure_at timestamptz;
BEGIN
  SELECT contact.conversation_status, contact.conversation_status_changed_at
  INTO v_status, v_status_changed_at
  FROM public.contacts AS contact
  WHERE contact.id = NEW.contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW; -- a FK existente retorna o erro canonico de contato inexistente.
  END IF;

  SELECT max(closure.created_at)
  INTO v_last_closure_at
  FROM public.conversation_closures AS closure
  WHERE closure.contact_id = NEW.contact_id;

  IF v_last_closure_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('open', 'waiting')
     OR v_status_changed_at IS NULL
     OR v_last_closure_at >= v_status_changed_at THEN
    RAISE EXCEPTION 'conversation_closure_requires_reopen'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$
