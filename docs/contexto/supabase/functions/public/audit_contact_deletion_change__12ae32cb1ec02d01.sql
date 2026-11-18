CREATE OR REPLACE FUNCTION public.audit_contact_deletion_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_operation text; BEGIN
  -- Limpeza (DELETE fisico): registra o marcador que a linha tinha ao ser apagada.
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contact_deletion_audit
      (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
    VALUES (
      OLD.id, 'purge', OLD.deleted_at, OLD.deleted_at, auth.uid(),
      (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    );
    RETURN NULL;
  END IF;

  -- `AFTER UPDATE OF deleted_at` ja limita o disparo aos UPDATEs que citam a coluna no SET;
  -- este teste barra `SET deleted_at = deleted_at` e qualquer UPDATE que cite a coluna sem
  -- alterar o valor. Sem ele o cenario (iii) gravaria sujeira.
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NULL;
  END IF;

  v_operation := CASE
    WHEN OLD.deleted_at IS NULL THEN 'delete'      -- NULL -> ts  (exclusao)
    WHEN NEW.deleted_at IS NULL THEN 'restore'     -- ts   -> NULL (restauracao)
    ELSE 'update_marker'                           -- ts   -> ts   (marcador reescrito)
  END;

  INSERT INTO public.contact_deletion_audit
    (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
  VALUES (
    NEW.id, v_operation, OLD.deleted_at, NEW.deleted_at, auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$
