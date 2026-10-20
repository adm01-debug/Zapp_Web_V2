-- E87: Rastreio de entrega Talk X
-- Adiciona external_id em talkx_recipients para casar DELIVERY_ACK do Evolution API
-- e incremento atomico de delivered_count em talkx_campaigns via RPC.

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_external_id
  ON public.talkx_recipients(external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.talkx_increment_delivered(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.talkx_campaigns
  SET delivered_count = delivered_count + 1
  WHERE id = p_campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.talkx_increment_delivered(uuid) TO service_role;
