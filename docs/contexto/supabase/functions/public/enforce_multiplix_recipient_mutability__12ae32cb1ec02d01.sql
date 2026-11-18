CREATE OR REPLACE FUNCTION public.enforce_multiplix_recipient_mutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_status text;
BEGIN
  -- #1267: dispensado só quem NÃO é o ator `authenticated`, decidido pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- #1267: sessão `authenticated` sem a claim do JWT não é "livre" — é indistinguível de ataque. Nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'multiplix_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sem caso de uso legitimo para staff reescrever destinatario: o estado de
  -- entrega e do worker (claim/lease/snapshot) e o UPDATE direto permitia
  -- sent -> pending (reenvio) e troca de destino_e164 (reenvio para outro numero).
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'multiplix_recipient_update_denied' USING ERRCODE = '42501';
  END IF;

  SELECT dispatch.status INTO v_dispatch_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = COALESCE(NEW.dispatch_id, OLD.dispatch_id);

  IF v_dispatch_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'multiplix_recipient_%_requires_draft', lower(TG_OP) USING ERRCODE = '55000';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
