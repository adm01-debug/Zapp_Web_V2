-- Fase 1 (E06) — trilha de auditoria das mudanças de endereço em `contacts`.
--
-- Serve para detectar regressão do C1 (E96): se uma edição de contato voltar a apagar
-- endereço sem intenção, o evento `contact_address_changed` com `cleared=true` aparece
-- em `audit_logs`. Sem PII no `details` — só o `contact_id` e o booleano `cleared`
-- (mesmo padrão de `audit_role_changes`), nunca o endereço em si.
CREATE OR REPLACE FUNCTION public.audit_contact_address_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- `AFTER UPDATE OF <colunas>` já limita o disparo às colunas de endereço; este teste
  -- garante que só registra quando o valor REALMENTE mudou.
  IF OLD.address         IS DISTINCT FROM NEW.address
     OR OLD.address_number IS DISTINCT FROM NEW.address_number
     OR OLD.neighborhood   IS DISTINCT FROM NEW.neighborhood
     OR OLD.city           IS DISTINCT FROM NEW.city
     OR OLD.state          IS DISTINCT FROM NEW.state
     OR OLD.postal_code    IS DISTINCT FROM NEW.postal_code
     OR OLD.latitude       IS DISTINCT FROM NEW.latitude
     OR OLD.longitude      IS DISTINCT FROM NEW.longitude
  THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'contact_address_changed',
      'contacts',
      NEW.id,
      jsonb_build_object(
        'contact_id', NEW.id,
        -- "cleared" = endereço e coordenada ficaram vazios no mesmo UPDATE
        'cleared', (NEW.address IS NULL AND NEW.city IS NULL
                    AND NEW.latitude IS NULL AND NEW.longitude IS NULL)
      )
    );
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_contact_address_change ON public.contacts;

CREATE TRIGGER trg_audit_contact_address_change
AFTER UPDATE OF address, address_number, neighborhood, city, state, postal_code, latitude, longitude
ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_address_change();
