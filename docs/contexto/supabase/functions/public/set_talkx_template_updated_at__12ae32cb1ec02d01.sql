CREATE OR REPLACE FUNCTION public.set_talkx_template_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
     AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.use_count = OLD.use_count + 1 THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := transaction_timestamp();
  END IF;
  RETURN NEW;
END;
$function$
