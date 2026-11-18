ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT IF EXISTS talkx_campaign_events_type_check

ALTER TABLE public.talkx_campaign_events ADD CONSTRAINT talkx_campaign_events_type_check
  CHECK (event_type IN (
    'created', 'updated', 'scheduled', 'started', 'paused', 'resumed', 'cancelled', 'completed', 'note',
    'scheduled_updated', 'limits_updated', 'connection_failed', 'resumed_auto', 'skipped_suppressed',
    'suppression_add', 'suppression_remove', 'suppression_update', 'segments_reviewed', 'checklist'
  ))

ALTER TABLE public.talkx_campaign_events ALTER COLUMN campaign_id DROP NOT NULL

ALTER TABLE public.talkx_campaign_events ADD COLUMN IF NOT EXISTS entity_type text

ALTER TABLE public.talkx_campaign_events ADD COLUMN IF NOT EXISTS entity_id uuid

ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT IF EXISTS talkx_campaign_events_target_check

ALTER TABLE public.talkx_campaign_events ADD CONSTRAINT talkx_campaign_events_target_check
  CHECK (campaign_id IS NOT NULL OR (entity_type IS NOT NULL AND entity_id IS NOT NULL))

DROP POLICY IF EXISTS "talkx_campaign_events_select" ON public.talkx_campaign_events

CREATE POLICY "talkx_campaign_events_select" ON public.talkx_campaign_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())))
    OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
  )

DROP POLICY IF EXISTS "talkx_campaign_events_insert" ON public.talkx_campaign_events

CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())))
    OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
  )
