CREATE OR REPLACE FUNCTION public.delivery_stats(p_contact_id uuid, p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_from timestamptz; v_is_group boolean; v_result jsonb;
BEGIN
  IF p_contact_id IS NULL THEN RETURN NULL; END IF;
  IF p_hours IS NULL OR p_hours < 1 THEN RAISE EXCEPTION 'delivery_stats: p_hours invalido (%)', p_hours USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN RETURN NULL; END IF;
  SELECT (regexp_replace(coalesce(c.phone,''),'[^0-9-]','','g') ~ '^[0-9]+-[0-9]+$' OR EXISTS (SELECT 1 FROM public.whatsapp_groups g WHERE replace(g.group_id,'@g.us','')=c.phone)) INTO v_is_group FROM public.contacts c WHERE c.id=p_contact_id AND c.deleted_at IS NULL;
  IF v_is_group IS NULL THEN RETURN NULL; END IF;
  v_from := now()-make_interval(hours=>p_hours);
  WITH janela AS (
    SELECT m.sender, m.status, m.created_at FROM public.messages m
    WHERE m.contact_id=p_contact_id AND m.created_at>=v_from AND coalesce(m.is_deleted,false)=false
  ),
  contagem AS (
    SELECT
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('sent','delivered','read','played'))::integer AS sent,
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('delivered','read','played'))::integer AS delivered,
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('read','played'))::integer AS read,
      count(*) FILTER (WHERE j.sender='agent' AND j.status='failed')::integer AS failed,
      count(*) FILTER (WHERE j.sender<>'agent')::integer AS received,
      count(*)::integer AS total_messages,
      max(j.created_at) FILTER (WHERE j.sender='agent' AND j.status IN ('sent','delivered','read','played')) AS last_sent_at,
      max(j.created_at) FILTER (WHERE j.sender='agent' AND j.status IN ('delivered','read','played')) AS last_delivered_at,
      max(j.created_at) FILTER (WHERE j.sender='agent' AND j.status IN ('read','played')) AS last_read_at
    FROM janela j
  ),
  horas AS (
    SELECT (date_trunc('hour',j.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS hour,
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('sent','delivered','read','played'))::integer AS sent,
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('delivered','read','played'))::integer AS delivered,
      count(*) FILTER (WHERE j.sender='agent' AND j.status IN ('read','played'))::integer AS read
    FROM janela j GROUP BY 1
  )
  SELECT jsonb_build_object('contact_id',p_contact_id,'is_group',v_is_group,'window_hours',p_hours,'totals',to_jsonb(contagem.*),'timeline',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM horas h),'[]'::jsonb))
  INTO v_result FROM contagem;
  RETURN v_result;
END;
$function$
