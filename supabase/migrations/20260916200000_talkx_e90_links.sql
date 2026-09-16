-- E90 · Links rastreáveis: talkx_links, talkx_link_clicks, talkx_conversions

CREATE TABLE IF NOT EXISTS public.talkx_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  label       text NOT NULL,
  target_url  text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talkx_link_clicks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      uuid NOT NULL REFERENCES public.talkx_links(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  clicked_at   timestamptz NOT NULL DEFAULT now(),
  ua           text,
  ip_hash      text
);

CREATE TABLE IF NOT EXISTS public.talkx_conversions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  link_id      uuid REFERENCES public.talkx_links(id) ON DELETE SET NULL,
  value        numeric(12,2),
  source       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS clicked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_talkx_links_campaign     ON public.talkx_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_talkx_links_slug         ON public.talkx_links(slug);
CREATE INDEX IF NOT EXISTS idx_talkx_link_clicks_link   ON public.talkx_link_clicks(link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_talkx_conversions_camp   ON public.talkx_conversions(campaign_id);

ALTER TABLE public.talkx_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_link_clicks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_conversions  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_links        FROM PUBLIC;
REVOKE ALL ON public.talkx_link_clicks  FROM PUBLIC;
REVOKE ALL ON public.talkx_conversions  FROM PUBLIC;
GRANT ALL ON public.talkx_links        TO service_role;
GRANT ALL ON public.talkx_link_clicks  TO service_role;
GRANT ALL ON public.talkx_conversions  TO service_role;

CREATE OR REPLACE FUNCTION public.record_talkx_link_click(
  p_slug        text,
  p_recipient   uuid DEFAULT NULL,
  p_ua          text DEFAULT NULL,
  p_ip_hash     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link      public.talkx_links%ROWTYPE;
  v_click_id  uuid;
BEGIN
  SELECT * INTO v_link FROM public.talkx_links WHERE slug = p_slug;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'link_not_found'); END IF;

  INSERT INTO public.talkx_link_clicks(link_id, recipient_id, ua, ip_hash)
  VALUES (v_link.id, p_recipient, p_ua, p_ip_hash)
  RETURNING id INTO v_click_id;

  IF p_recipient IS NOT NULL THEN
    UPDATE public.talkx_recipients
       SET clicked_at  = COALESCE(clicked_at, now()),
           click_count = click_count + 1
     WHERE id = p_recipient;
  END IF;

  RETURN jsonb_build_object(
    'click_id',    v_click_id,
    'link_id',     v_link.id,
    'target_url',  v_link.target_url,
    'campaign_id', v_link.campaign_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) TO service_role;
