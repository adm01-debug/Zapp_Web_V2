DROP FUNCTION IF EXISTS public.transition_talkx_campaign(uuid, text)

ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_status_check

ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_status_check
  CHECK (status = ANY (ARRAY['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled']))
