CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.ai_providers
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true
      AND use_for && NEW.use_for;
  END IF;
  RETURN NEW;
END;
$function$
