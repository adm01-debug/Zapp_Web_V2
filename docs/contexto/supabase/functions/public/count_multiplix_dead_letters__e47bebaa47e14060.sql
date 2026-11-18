CREATE OR REPLACE FUNCTION public.count_multiplix_dead_letters(p_dispatch_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'multiplix_dead_letters_forbidden'
      USING HINT = 'Somente admin/supervisor consulta a dead letter do Multiplix.';
  END IF;

  RETURN (
    SELECT count(*)
    FROM public.multiplix_delivery_items AS i
    WHERE i.status = 'failed'
      AND i.next_attempt_at IS NULL
      AND (p_dispatch_id IS NULL OR i.dispatch_id = p_dispatch_id)
  );
END;
$function$
