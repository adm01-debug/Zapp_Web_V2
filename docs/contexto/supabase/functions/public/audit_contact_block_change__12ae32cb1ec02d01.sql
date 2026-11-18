CREATE OR REPLACE FUNCTION public.audit_contact_block_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ DECLARE v_operation text; BEGIN
  -- `AFTER UPDATE OF blocked_at` ja limita o disparo aos UPDATEs que citam a coluna no SET;
  -- este teste barra `SET blocked_at = blocked_at` e qualquer UPDATE que a cite sem alterar
  -- o valor (nao gravar sujeira).
  IF OLD.blocked_at IS NOT DISTINCT FROM NEW.blocked_at THEN
    RETURN NULL;
  END IF;

  v_operation := CASE
    WHEN OLD.blocked_at IS NULL THEN 'block'          -- NULL -> ts  (bloqueio)
    WHEN NEW.blocked_at IS NULL THEN 'unblock'        -- ts   -> NULL (desbloqueio)
    ELSE 'update_marker'                              -- ts   -> ts   (marcador reescrito)
  END;

  INSERT INTO public.contact_block_audit
    (contact_id, operation, blocked_at_from, blocked_at_to, performed_by, performed_by_profile)
  VALUES (
    NEW.id, v_operation, OLD.blocked_at, NEW.blocked_at, auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$
