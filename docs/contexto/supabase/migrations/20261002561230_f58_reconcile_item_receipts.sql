DROP FUNCTION IF EXISTS public.record_multiplix_item_delivered(text, uuid)

CREATE OR REPLACE FUNCTION public.record_multiplix_item_delivered(
  p_external_id text,
  p_connection_id uuid,
  p_event text DEFAULT 'delivered'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item_id     uuid;
  v_dispatch_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
  v_event       text := COALESCE(NULLIF(btrim(p_event), ''), 'delivered');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_ack' USING ERRCODE = '22023';
  END IF;
  IF v_event NOT IN ('delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_event' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));

  -- O filtro e o que torna a operacao idempotente e monotona: 'delivered' so casa item
  -- que ainda nao tem delivered_at (entao nao rebaixa um item que ja foi para 'read',
  -- que e mais adiante na linha do tempo), e 'read' so casa item sem read_at.
  BEGIN
    IF v_event = 'delivered' THEN
      SELECT item.id, item.dispatch_id
        INTO STRICT v_item_id, v_dispatch_id
        FROM public.multiplix_delivery_items AS item
        JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
       WHERE item.external_id = v_external_id
         AND item.delivered_at IS NULL
         AND dispatch.whatsapp_connection_id = p_connection_id
       FOR UPDATE OF item;
    ELSE
      SELECT item.id, item.dispatch_id
        INTO STRICT v_item_id, v_dispatch_id
        FROM public.multiplix_delivery_items AS item
        JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
       WHERE item.external_id = v_external_id
         AND item.read_at IS NULL
         AND dispatch.whatsapp_connection_id = p_connection_id
       FOR UPDATE OF item;
    END IF;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  IF v_event = 'delivered' THEN
    UPDATE public.multiplix_delivery_items
       SET status = 'delivered',
           delivered_at = statement_timestamp(),
           updated_at = statement_timestamp()
     WHERE id = v_item_id;
  ELSE
    -- READ implica entrega: um item que chega aqui em 'sent' ou 'outcome_unknown' passa
    -- a 'read' com os dois carimbos (delivered_at ainda nulo e preenchido agora), o que
    -- mantem o contador consistente e nao inventa um estado impossivel.
    UPDATE public.multiplix_delivery_items
       SET status = 'read',
           delivered_at = COALESCE(delivered_at, statement_timestamp()),
           read_at = statement_timestamp(),
           updated_at = statement_timestamp()
     WHERE id = v_item_id;
  END IF;

  -- contador recalculado (idempotente) — ver §1 do cabecalho da f32b
  UPDATE public.multiplix_dispatches AS dispatch
     SET delivered_count = (
           SELECT count(*) FROM public.multiplix_delivery_items AS i
            WHERE i.dispatch_id = dispatch.id
              AND i.status IN ('delivered', 'read')
         ),
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;

  RETURN true;
END;
$function$

REVOKE ALL ON FUNCTION public.record_multiplix_item_delivered(text, uuid, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.record_multiplix_item_delivered(text, uuid, text) TO service_role
