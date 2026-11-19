CREATE OR REPLACE FUNCTION public.sweep_multiplix_stuck_items(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_swept      integer := 0;
  v_dispatches uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_multiplix_sweep_limit' USING ERRCODE = '22023';
  END IF;

  WITH stuck AS (
    SELECT item.id, item.dispatch_id
      FROM public.multiplix_delivery_items AS item
     WHERE item.status = 'sending'
       AND item.lease_until < statement_timestamp()
       AND item.provider_dispatch_started_at IS NOT NULL
     ORDER BY item.lease_until
     LIMIT p_limit
     FOR UPDATE OF item SKIP LOCKED
  ), swept AS (
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE item.id = stuck.id
    RETURNING item.dispatch_id
  )
  SELECT COALESCE(count(*), 0), COALESCE(array_agg(DISTINCT swept.dispatch_id), ARRAY[]::uuid[])
    INTO v_swept, v_dispatches
    FROM swept;

  -- Statement separado de proposito: dentro do mesmo statement os CTEs nao veem as
  -- linhas que os outros CTEs escrevem, e o recalc leria o valor antigo.
  IF v_swept > 0 THEN
    UPDATE public.multiplix_dispatches AS dispatch
       SET outcome_unknown_count = (
             SELECT count(*) FROM public.multiplix_delivery_items AS i
              WHERE i.dispatch_id = dispatch.id AND i.status = 'outcome_unknown'
           ),
           updated_at = statement_timestamp()
     WHERE dispatch.id = ANY (v_dispatches);
  END IF;

  RETURN v_swept;
END;
$function$
