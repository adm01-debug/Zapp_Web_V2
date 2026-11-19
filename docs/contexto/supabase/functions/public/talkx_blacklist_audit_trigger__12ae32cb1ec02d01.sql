CREATE OR REPLACE FUNCTION public.talkx_blacklist_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Normaliza telefone: so digitos, formato 10-15 digitos; invalido vira NULL
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF NEW.phone !~ '^[0-9]{10,15}$' THEN
      NEW.phone := NULL;
    END IF;
  END IF;

  -- Preenche reason_code a partir de origin quando nulo (mapa do passo 7 da X070:
  -- optout/auto_optout -> opt_out, list -> manual, manual/lgpd -> eles mesmos;
  -- system fica NULL de proposito). So usa motivo ativo do catalogo.
  IF NEW.reason_code IS NULL AND NEW.origin IS NOT NULL THEN
    SELECT r.code INTO NEW.reason_code
      FROM public.talkx_suppression_reasons AS r
     WHERE r.active
       AND r.code = CASE NEW.origin
                      WHEN 'optout' THEN 'opt_out'
                      WHEN 'auto_optout' THEN 'opt_out'
                      WHEN 'list' THEN 'manual'
                      WHEN 'system' THEN NULL
                      ELSE NEW.origin
                    END;
  END IF;

  -- Forca blocked_by para o perfil do chamador no INSERT (sobrescreve o
  -- valor enviado pelo cliente); com auth.uid() nulo mantem o informado.
  -- No UPDATE o blocked_by original e preservado quando autenticado
  -- (N-107: a trilha de quem bloqueou nao muda depois do INSERT).
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := OLD.blocked_by;
  END IF;

  -- Forca removed_by para o perfil do chamador SOMENTE na transicao
  -- NULL -> preenchido de removed_at (o ato de remover); com auth.uid()
  -- nulo mantem o informado (service_role/backend, ex. talkx_suppress_contact).
  -- Linha ja removida que continua removida preserva a trilha original
  -- (removed_by e removed_at), para que editar removal_reason ou outro
  -- campo nao troque o autor da remocao.
  IF NEW.removed_at IS NOT NULL AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.removed_at IS NULL) THEN
    NEW.removed_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS NOT NULL THEN
    NEW.removed_by := OLD.removed_by;
    NEW.removed_at := OLD.removed_at;
  END IF;

  RETURN NEW;
END;
$function$
