CREATE OR REPLACE FUNCTION public.guard_talkx_template_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN
    RETURN NEW;
  END IF;

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
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count = OLD.use_count + 1 THEN
    RETURN NEW;
  END IF;

  -- A matching snapshot authorizes only the mutable content fields exposed by
  -- update_talkx_template_with_snapshot. Identity, ownership, creation time
  -- and usage accounting remain immutable even if another SQL path executes
  -- in the same statement.
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND EXISTS (
    SELECT 1
    FROM public.talkx_template_versions AS history
    WHERE history.template_id = OLD.id
      AND history.created_at = statement_timestamp()
      AND history.saved_by = public.get_profile_id_for_user(auth.uid())
      AND history.name IS NOT DISTINCT FROM OLD.name
      AND history.description IS NOT DISTINCT FROM OLD.description
      AND history.category IS NOT DISTINCT FROM OLD.category
      AND history.content IS NOT DISTINCT FROM OLD.content
      AND history.media_url IS NOT DISTINCT FROM OLD.media_url
      AND history.media_type IS NOT DISTINCT FROM OLD.media_type
      AND history.tags IS NOT DISTINCT FROM OLD.tags
      AND history.status IS NOT DISTINCT FROM OLD.status
      AND history.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc'
    USING ERRCODE = '42501';
END;
$function$
