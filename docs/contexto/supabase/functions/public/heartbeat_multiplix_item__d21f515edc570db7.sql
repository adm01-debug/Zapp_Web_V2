CREATE OR REPLACE FUNCTION public.heartbeat_multiplix_item(p_item_id uuid, p_claim_token uuid, p_lease_seconds integer DEFAULT 90)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_renovado integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  -- Mesma faixa aceita pelo claim_multiplix_item: o heartbeat nao pode inventar lease que
  -- o claim se recusaria a conceder.
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_item_heartbeat' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET lease_until = statement_timestamp() + make_interval(secs => p_lease_seconds),
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.lease_token = p_claim_token
     -- So o dono vivo do item renova: lease expirado ja pode ter sido retomado por outro
     -- worker (SKIP LOCKED), e renovar por cima disso roubaria o item de quem o tem agora.
     AND item.status = 'sending'
     AND item.lease_until > statement_timestamp();

  GET DIAGNOSTICS v_renovado = ROW_COUNT;
  RETURN v_renovado = 1;
END;
$function$
