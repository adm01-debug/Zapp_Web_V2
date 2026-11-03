CREATE OR REPLACE FUNCTION public.multiplix_bump_version_on_dispatch_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- So rascunho: o congelamento do confirm muda o status e e ele quem versiona.
  IF OLD.status <> 'draft' OR NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Metadados de trabalho (a propria versao, timestamps, contadores) nao sao
  -- "revisao": mudar so eles nao pode invalidar uma previa ja revisada.
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.template IS DISTINCT FROM OLD.template
     OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.audience_version IS DISTINCT FROM OLD.audience_version
     OR NEW.variables_snapshot IS DISTINCT FROM OLD.variables_snapshot THEN
    NEW.dispatch_version := OLD.dispatch_version + 1;
  END IF;

  RETURN NEW;
END;
$function$
