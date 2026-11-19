ALTER TABLE public.talkx_links
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text,
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL

CREATE UNIQUE INDEX IF NOT EXISTS talkx_links_campaign_label_lower_key
  ON public.talkx_links (campaign_id, lower(label))

ALTER TABLE public.talkx_links DROP CONSTRAINT IF EXISTS talkx_links_label_format_check

ALTER TABLE public.talkx_links ADD CONSTRAINT talkx_links_label_format_check
  CHECK (label ~ '^[a-z0-9][a-z0-9_-]{0,39}$')

ALTER TABLE public.talkx_links DROP CONSTRAINT IF EXISTS talkx_links_target_url_check

ALTER TABLE public.talkx_links ADD CONSTRAINT talkx_links_target_url_check
  CHECK (target_url ~ '^https://')

GRANT SELECT ON public.talkx_links TO authenticated

DROP POLICY IF EXISTS "Admins can view all links" ON public.talkx_links

CREATE POLICY "Admins can view all links" ON public.talkx_links
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Users can view links of own campaigns" ON public.talkx_links

CREATE POLICY "Users can view links of own campaigns" ON public.talkx_links
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT tc.id FROM public.talkx_campaigns tc
      WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
  )

GRANT SELECT ON public.talkx_link_clicks TO authenticated

DROP POLICY IF EXISTS "Users can view clicks of own campaigns" ON public.talkx_link_clicks

CREATE POLICY "Users can view clicks of own campaigns" ON public.talkx_link_clicks
  FOR SELECT TO authenticated
  USING (
    link_id IN (
      SELECT tl.id FROM public.talkx_links tl
      JOIN public.talkx_campaigns tc ON tc.id = tl.campaign_id
      WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
    OR is_admin_or_supervisor(auth.uid())
  )

GRANT SELECT ON public.talkx_conversions TO authenticated

DROP POLICY IF EXISTS "talkx_conversions_select" ON public.talkx_conversions

CREATE POLICY "talkx_conversions_select" ON public.talkx_conversions
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT tc.id FROM public.talkx_campaigns tc
      WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
    OR is_admin_or_supervisor(auth.uid())
  )

ALTER TABLE public.talkx_conversions
  ADD COLUMN IF NOT EXISTS external_ref  text,
  ADD COLUMN IF NOT EXISTS occurred_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS currency      text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS attribution   jsonb

CREATE UNIQUE INDEX IF NOT EXISTS talkx_conversions_dedupe_key
  ON public.talkx_conversions (campaign_id, source, external_ref)
  WHERE external_ref IS NOT NULL AND source IS NOT NULL

ALTER TABLE public.talkx_conversions DROP CONSTRAINT IF EXISTS talkx_conversions_value_check

ALTER TABLE public.talkx_conversions ADD CONSTRAINT talkx_conversions_value_check
  CHECK (value IS NULL OR value >= 0)

ALTER TABLE public.talkx_conversions DROP CONSTRAINT IF EXISTS talkx_conversions_source_check

ALTER TABLE public.talkx_conversions ADD CONSTRAINT talkx_conversions_source_check
  CHECK (source IS NULL OR source IN ('whatsapp','manual','import','api','checkout'))

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS investment numeric(12,2)

COMMENT ON COLUMN public.talkx_campaigns.investment IS
  'Investimento total em moeda (BRL); informado pela equipe, fora dos contadores de envio.'

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('conversion_max_value', '100000', 'Teto de valor por conversão (BRL)')
ON CONFLICT (key) DO NOTHING

ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT IF EXISTS talkx_campaign_events_type_check

ALTER TABLE public.talkx_campaign_events ADD CONSTRAINT talkx_campaign_events_type_check
  CHECK (event_type IN (
    'created', 'updated', 'scheduled', 'started', 'paused', 'resumed', 'cancelled', 'completed', 'note',
    'scheduled_updated', 'limits_updated', 'connection_failed', 'resumed_auto', 'skipped_suppressed',
    'suppression_add', 'suppression_remove', 'suppression_update', 'segments_reviewed', 'checklist',
    'link_created', 'link_updated', 'link_deleted', 'investment_updated',
    'report_exported', 'report_shared', 'import_created', 'import_completed'
  ))

CREATE OR REPLACE FUNCTION public.talkx_upsert_link(
  p_campaign_id  uuid,
  p_label        text,
  p_target_url   text,
  p_link_id      uuid DEFAULT NULL,
  p_utm_source   text DEFAULT NULL,
  p_utm_medium   text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content  text DEFAULT NULL,
  p_utm_term     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor     uuid;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_link_id   uuid;
  v_slug      text;
  v_event     text;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_link_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_found' USING ERRCODE = '23503';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_editable' USING ERRCODE = '22023';
  END IF;

  IF p_label !~ '^[a-z0-9][a-z0-9_-]{0,39}$' THEN
    RAISE EXCEPTION 'talkx_link_invalid_label' USING ERRCODE = '22023';
  END IF;
  IF p_target_url !~ '^https://' THEN
    RAISE EXCEPTION 'talkx_link_invalid_target' USING ERRCODE = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    UPDATE public.talkx_links
       SET label        = p_label,
           target_url   = p_target_url,
           utm_source   = p_utm_source,
           utm_medium   = p_utm_medium,
           utm_campaign = p_utm_campaign,
           utm_content  = p_utm_content,
           utm_term     = p_utm_term
     WHERE id = p_link_id AND campaign_id = p_campaign_id
     RETURNING id INTO v_link_id;
    IF v_link_id IS NULL THEN
      RAISE EXCEPTION 'talkx_link_not_found' USING ERRCODE = '23503';
    END IF;
    v_event := 'link_updated';
  ELSE
    v_slug := substr(md5(gen_random_uuid()::text), 1, 10);
    INSERT INTO public.talkx_links (campaign_id, label, target_url, slug, created_by,
                                    utm_source, utm_medium, utm_campaign, utm_content, utm_term)
    VALUES (p_campaign_id, p_label, p_target_url, v_slug, v_actor,
            p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term)
    RETURNING id INTO v_link_id;
    v_event := 'link_created';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, v_event, v_actor, p_label);

  RETURN jsonb_build_object(
    'id',    v_link_id,
    'slug',  (SELECT slug FROM public.talkx_links WHERE id = v_link_id),
    'event', v_event
  );
END;
$function$

REVOKE ALL ON FUNCTION public.talkx_upsert_link(uuid, text, text, uuid, text, text, text, text, text) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.talkx_upsert_link(uuid, text, text, uuid, text, text, text, text, text) TO authenticated

CREATE OR REPLACE FUNCTION public.talkx_delete_link(p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor     uuid;
  v_link      public.talkx_links%ROWTYPE;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_clicks    bigint;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_link_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link FROM public.talkx_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_link_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = v_link.campaign_id;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_link_campaign_not_editable' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_clicks FROM public.talkx_link_clicks WHERE link_id = p_link_id;
  IF v_clicks > 0 THEN
    RAISE EXCEPTION 'talkx_link_has_clicks' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.talkx_links WHERE id = p_link_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (v_link.campaign_id, 'link_deleted', v_actor, v_link.label);

  RETURN jsonb_build_object('id', p_link_id, 'deleted', true);
END;
$function$

REVOKE ALL ON FUNCTION public.talkx_delete_link(uuid) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.talkx_delete_link(uuid) TO authenticated

CREATE OR REPLACE FUNCTION public.record_talkx_conversion(
  p_campaign_id   uuid,
  p_external_ref  text,
  p_value         numeric,
  p_source        text,
  p_currency      text DEFAULT 'BRL',
  p_link_id       uuid DEFAULT NULL,
  p_recipient_id  uuid DEFAULT NULL,
  p_occurred_at   timestamptz DEFAULT now(),
  p_attribution   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_max_value     numeric;
  v_link_campaign uuid;
  v_id            uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'talkx_conversion_service_role_only' USING ERRCODE = '42501';
  END IF;

  v_max_value := COALESCE(
    (SELECT (value #>> '{}')::numeric FROM public.talkx_settings WHERE key = 'conversion_max_value'),
    100000
  );

  IF p_value < 0 THEN
    RAISE EXCEPTION 'talkx_conversion_value_negative' USING ERRCODE = '22023';
  END IF;
  IF p_value > v_max_value THEN
    RAISE EXCEPTION 'talkx_conversion_value_exceeds_max' USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('whatsapp','manual','import','api','checkout') THEN
    RAISE EXCEPTION 'talkx_conversion_invalid_source' USING ERRCODE = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT campaign_id INTO v_link_campaign FROM public.talkx_links WHERE id = p_link_id;
    IF v_link_campaign IS DISTINCT FROM p_campaign_id THEN
      RAISE EXCEPTION 'talkx_conversion_link_campaign_mismatch' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_occurred_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'talkx_conversion_occurred_at_in_future' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.talkx_conversions
    (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution)
  VALUES
    (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, p_occurred_at, p_currency, p_attribution)
  ON CONFLICT (campaign_id, source, external_ref) WHERE external_ref IS NOT NULL AND source IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  RETURN jsonb_build_object('status', 'recorded', 'id', v_id);
END;
$function$

REVOKE ALL ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) TO service_role

CREATE OR REPLACE FUNCTION public.talkx_set_campaign_investment(
  p_campaign_id uuid,
  p_investment  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor    uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  v_actor := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);

  IF NOT COALESCE(public.is_admin_or_supervisor(auth.uid()), false) THEN
    RAISE EXCEPTION 'talkx_investment_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_investment < 0 THEN
    RAISE EXCEPTION 'talkx_investment_negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_investment_campaign_not_found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.talkx_campaigns
     SET investment = p_investment, updated_at = now()
   WHERE id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'investment_updated', v_actor, p_investment::text);

  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'investment', p_investment);
END;
$function$

REVOKE ALL ON FUNCTION public.talkx_set_campaign_investment(uuid, numeric) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.talkx_set_campaign_investment(uuid, numeric) TO authenticated
