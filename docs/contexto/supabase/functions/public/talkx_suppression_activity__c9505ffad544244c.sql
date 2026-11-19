CREATE OR REPLACE FUNCTION public.talkx_suppression_activity(p_limite integer DEFAULT 5, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_limite integer;
  v_offset integer;
  v_total  integer := 0;
  v_rows   jsonb := '[]'::jsonb;
  v_rec    record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_suppression_read_role_required' USING ERRCODE = '42501';
  END IF;

  v_limite := COALESCE(p_limite, 5);
  IF v_limite < 1 OR v_limite > 200 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_limit' USING ERRCODE = '22023';
  END IF;

  v_offset := COALESCE(p_offset, 0);
  IF v_offset < 0 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_offset' USING ERRCODE = '22023';
  END IF;

  FOR v_rec IN
    WITH base AS (
      SELECT e.id,
             e.event_type,
             e.message,
             e.created_at,
             e.entity_type,
             e.entity_id,
             pr.name AS actor_name,
             c.name  AS contact_name,
             c.email AS contact_email,
             COALESCE(c.phone, b.phone) AS contact_phone,
             CASE e.event_type
               WHEN 'suppression_add'    THEN 'adicionado'
               WHEN 'suppression_remove' THEN 'removido'
               WHEN 'suppression_update' THEN 'atualizado'
               WHEN 'suppression_import' THEN 'importacao'
               WHEN 'suppression_export' THEN 'exportacao'
             END AS kind
        FROM public.talkx_campaign_events e
        LEFT JOIN public.profiles pr ON pr.id = e.actor_id
        LEFT JOIN public.talkx_blacklist b
               ON e.entity_type = 'talkx_blacklist' AND b.id = e.entity_id
        LEFT JOIN public.contacts c
               ON c.id = COALESCE(b.contact_id, CASE WHEN e.entity_type = 'contact' THEN e.entity_id END)
       WHERE e.event_type IN (
               'suppression_add', 'suppression_remove', 'suppression_update',
               'suppression_import', 'suppression_export'
             )
    )
    SELECT b.*, count(*) OVER () AS total_count
      FROM base b
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT v_limite OFFSET v_offset
  LOOP
    v_total := v_rec.total_count;
    v_rows := v_rows || jsonb_build_object(
      'id',            v_rec.id,
      'event_type',    v_rec.event_type,
      'kind',          v_rec.kind,
      'actor_name',    v_rec.actor_name,
      'contact_name',  v_rec.contact_name,
      'contact_email', v_rec.contact_email,
      'contact_phone', v_rec.contact_phone,
      'message',       v_rec.message,
      'created_at',    v_rec.created_at
    );
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$
