CREATE OR REPLACE FUNCTION public.resolve_outbound_whatsapp_connection(p_explicit_connection_id uuid, p_assigned_connection_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_connection_id uuid;
BEGIN
  IF p_explicit_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_explicit_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
      AND connection.instance_id <> 'E2E_FIXTURE';
    IF v_connection_id IS NULL THEN
      RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
    END IF;
    RETURN v_connection_id;
  END IF;
  IF p_assigned_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_assigned_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
      AND connection.instance_id <> 'E2E_FIXTURE';
    IF v_connection_id IS NOT NULL THEN
      RETURN v_connection_id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_connections AS connection
      WHERE connection.id = p_assigned_connection_id
    ) THEN
      RAISE EXCEPTION 'contact_whatsapp_connection_disconnected' USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT connection.id INTO v_connection_id
  FROM public.whatsapp_connections AS connection
  WHERE connection.status = 'connected'
    AND NULLIF(connection.instance_id, '') IS NOT NULL
    AND connection.instance_id <> 'E2E_FIXTURE'
    AND COALESCE(connection.name, '') NOT LIKE '[E2E]%'
  ORDER BY connection.updated_at DESC, connection.id
  LIMIT 1;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'no_connected_whatsapp_connection' USING ERRCODE = '22023';
  END IF;
  RETURN v_connection_id;
END;
$function$
