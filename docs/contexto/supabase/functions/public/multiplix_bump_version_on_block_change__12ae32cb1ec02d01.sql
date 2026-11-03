CREATE OR REPLACE FUNCTION public.multiplix_bump_version_on_block_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_id uuid;
BEGIN
  v_dispatch_id := COALESCE(NEW.dispatch_id, OLD.dispatch_id);

  UPDATE public.multiplix_dispatches
     SET dispatch_version = dispatch_version + 1
   WHERE id = v_dispatch_id
     AND status = 'draft';

  RETURN COALESCE(NEW, OLD);
END;
$function$
