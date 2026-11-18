CREATE INDEX IF NOT EXISTS idx_talkx_link_clicks_recipient_id
  ON public.talkx_link_clicks (recipient_id)

CREATE INDEX IF NOT EXISTS idx_talkx_conversions_recipient_id
  ON public.talkx_conversions (recipient_id)

CREATE INDEX IF NOT EXISTS idx_talkx_conversions_link_id
  ON public.talkx_conversions (link_id)
