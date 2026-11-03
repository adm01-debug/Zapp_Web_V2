CREATE OR REPLACE FUNCTION public.reorder_multiplix_blocks(p_dispatch_id uuid, p_block_ids uuid[])
 RETURNS TABLE(block_id uuid, block_order smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_input_count    integer;
  v_input_distinct integer;
  v_dispatch_count integer;
  v_matched        integer;
  v_min_order      smallint;
  v_max_order      smallint;
  v_offset         integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL OR p_block_ids IS NULL OR array_length(p_block_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_block_reorder' USING ERRCODE = '22023';
  END IF;

  IF array_position(p_block_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'multiplix_block_reorder_null_id' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT b) INTO v_input_count, v_input_distinct
    FROM unnest(p_block_ids) AS b;

  IF v_input_count <> v_input_distinct THEN
    RAISE EXCEPTION 'multiplix_block_reorder_duplicate_ids' USING ERRCODE = '22023';
  END IF;

  -- Serializa reordenacoes concorrentes do mesmo dispatch.
  PERFORM 1 FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id
   FOR UPDATE;

  SELECT count(*) INTO v_dispatch_count
    FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id;

  IF v_dispatch_count <> v_input_count THEN
    RAISE EXCEPTION 'multiplix_block_reorder_set_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_matched
    FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id
     AND id = ANY (p_block_ids);

  IF v_matched <> v_input_count THEN
    RAISE EXCEPTION 'multiplix_block_reorder_foreign_block' USING ERRCODE = '22023';
  END IF;

  -- Passo 1: move TODA a faixa para cima de max(valor_atual, n-1), ficando disjunta tanto dos
  -- valores antigos (ainda nao reescritos) quanto da faixa final 0..n-1 do passo 2.
  SELECT min(b.block_order), max(b.block_order) INTO v_min_order, v_max_order
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  v_offset := GREATEST(v_max_order::integer, v_input_count - 1) - v_min_order::integer + 1;

  IF (v_max_order::integer + v_offset) > 32767 THEN
    RAISE EXCEPTION 'multiplix_block_reorder_range_overflow' USING ERRCODE = '22003';
  END IF;

  UPDATE public.multiplix_blocks AS b
     SET block_order = (b.block_order::integer + v_offset)::smallint
   WHERE b.dispatch_id = p_dispatch_id;

  -- Passo 2: ordem final (0 = primeiro da lista).
  RETURN QUERY
  UPDATE public.multiplix_blocks AS b
     SET block_order = (ord.pos - 1)::smallint,
         updated_at  = statement_timestamp()
    FROM unnest(p_block_ids) WITH ORDINALITY AS ord(id, pos)
   WHERE b.dispatch_id = p_dispatch_id
     AND b.id = ord.id
  RETURNING b.id, b.block_order;
END;
$function$
