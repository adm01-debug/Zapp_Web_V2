CREATE OR REPLACE FUNCTION public.prevent_call_contact_redirect()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caminho de sistema: webhook/RPC SECURITY DEFINER (dono `postgres`) e cliente service_role
  -- (edge function). O chamador final ali é o provedor, não um usuário logado.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     AND NEW.contact_id IS NOT NULL
     AND NOT public.is_contact_visible_to_user(NEW.contact_id, auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para apontar a chamada para este contato'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
