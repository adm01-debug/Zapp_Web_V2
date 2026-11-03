CREATE OR REPLACE FUNCTION public.trg_talkx_increment_template_use_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- INSERT com template e status != draft
  IF TG_OP = 'INSERT'
     AND NEW.template_id IS NOT NULL
     AND NEW.status <> 'draft'
  THEN
    UPDATE public.talkx_templates
       SET use_count = COALESCE(use_count, 0) + 1
     WHERE id = NEW.template_id;

  -- UPDATE: saiu de draft com template presente
  ELSIF TG_OP = 'UPDATE'
     AND NEW.template_id IS NOT NULL
     AND COALESCE(OLD.status, '') = 'draft'
     AND NEW.status <> 'draft'
  THEN
    UPDATE public.talkx_templates
       SET use_count = COALESCE(use_count, 0) + 1
     WHERE id = NEW.template_id;
  END IF;

  RETURN NEW;
END;
$function$
