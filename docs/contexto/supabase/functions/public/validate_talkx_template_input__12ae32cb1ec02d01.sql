CREATE OR REPLACE FUNCTION public.validate_talkx_template_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.name IS NULL OR length(btrim(NEW.name)) NOT BETWEEN 1 AND 200
     OR NEW.category IS NULL OR length(btrim(NEW.category)) NOT BETWEEN 1 AND 100
     OR NEW.content IS NULL OR length(NEW.content) NOT BETWEEN 1 AND 65536
     OR NEW.status IS NULL OR NEW.status NOT IN ('draft', 'review', 'approved')
     OR (NEW.description IS NOT NULL AND length(NEW.description) > 4000)
     OR (NEW.media_url IS NOT NULL AND (
       length(NEW.media_url) > 8192 OR NEW.media_url !~ '^https://'
     ))
     OR (NEW.media_type IS NOT NULL
         AND NEW.media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR COALESCE(cardinality(NEW.tags), 0) > 50
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(NEW.tags, '{}'::text[])) AS tag
       WHERE length(tag) NOT BETWEEN 1 AND 64
     )
     OR COALESCE(cardinality(NEW.custom_variables), 0) > 100
     OR EXISTS (
       SELECT 1
       FROM unnest(COALESCE(NEW.custom_variables, '{}'::text[])) AS variable
       WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
     )
     OR cardinality(ARRAY(
       SELECT DISTINCT value
       FROM unnest(COALESCE(NEW.custom_variables, '{}'::text[])) AS value
     )) IS DISTINCT FROM cardinality(COALESCE(NEW.custom_variables, '{}'::text[])) THEN
    RAISE EXCEPTION 'invalid_talkx_template' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$
