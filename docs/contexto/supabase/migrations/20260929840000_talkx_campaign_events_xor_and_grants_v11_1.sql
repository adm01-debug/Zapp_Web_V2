ALTER TABLE public.talkx_campaign_events
  DROP CONSTRAINT IF EXISTS talkx_campaign_events_target_check

ALTER TABLE public.talkx_campaign_events
  ADD CONSTRAINT talkx_campaign_events_target_check
  CHECK ((campaign_id IS NOT NULL) <> ((entity_type IS NOT NULL) AND (entity_id IS NOT NULL)))

ALTER TABLE public.talkx_campaign_events
  DROP CONSTRAINT IF EXISTS talkx_campaign_events_entity_type_format_check

ALTER TABLE public.talkx_campaign_events
  ADD CONSTRAINT talkx_campaign_events_entity_type_format_check
  CHECK (entity_type IS NULL OR entity_type ~ '^[a-z][a-z0-9_.]{1,40}$')

REVOKE TRUNCATE, DELETE, UPDATE, TRIGGER, REFERENCES
  ON public.talkx_campaign_events FROM anon, authenticated
