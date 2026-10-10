-- Complete the Talk X recovery rollout after structural deployment.
-- Supabase default function grants can leave direct EXECUTE privileges even
-- after PUBLIC is revoked, so every callable role is handled explicitly.

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_talkx_recipient_snapshot_mutability()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_valid_talkx_schedule_timezone(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_talkx_schedule_timezone(text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_talkx_draft_recipients(uuid, uuid[])
  TO authenticated;

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

-- NOT VALID protected every new write during the online rollout. Before
-- marking the constraints validated, prove aggregate-only that no historical
-- row violates any of them. No business data is emitted on failure.
DO $migration$
DECLARE
  v_invalid_external_id bigint;
  v_invalid_media_snapshot bigint;
  v_invalid_timezone bigint;
  v_invalid_send_window bigint;
  v_invalid_revision bigint;
BEGIN
  SELECT count(*) INTO v_invalid_external_id
  FROM public.talkx_recipients
  WHERE external_id IS NOT NULL
    AND length(btrim(external_id)) NOT BETWEEN 1 AND 512;

  SELECT count(*) INTO v_invalid_media_snapshot
  FROM public.talkx_recipients
  WHERE NOT (
    (media_url_snapshot IS NULL AND media_type_snapshot IS NULL)
    OR (
      length(btrim(media_url_snapshot)) BETWEEN 1 AND 8192
      AND media_type_snapshot IN ('image', 'video', 'document', 'audio')
    )
  );

  SELECT count(*) INTO v_invalid_timezone
  FROM public.talkx_campaigns
  WHERE public.is_valid_talkx_schedule_timezone(schedule_timezone) IS NOT TRUE;

  SELECT count(*) INTO v_invalid_send_window
  FROM public.talkx_campaigns
  WHERE NOT (
    (send_window_start IS NULL AND send_window_end IS NULL)
    OR (
      send_window_start IS NOT NULL
      AND send_window_end IS NOT NULL
      AND send_window_start < send_window_end
    )
  );

  SELECT count(*) INTO v_invalid_revision
  FROM public.talkx_campaigns
  WHERE revision <= 0;

  IF v_invalid_external_id <> 0
     OR v_invalid_media_snapshot <> 0
     OR v_invalid_timezone <> 0
     OR v_invalid_send_window <> 0
     OR v_invalid_revision <> 0 THEN
    RAISE EXCEPTION 'talkx_constraint_validation_preflight_failed'
      USING ERRCODE = '23514';
  END IF;
END;
$migration$;

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.talkx_recipients
  VALIDATE CONSTRAINT talkx_recipients_external_id_bounded;
ALTER TABLE public.talkx_recipients
  VALIDATE CONSTRAINT talkx_recipients_media_snapshot_shape;
ALTER TABLE public.talkx_campaigns
  VALIDATE CONSTRAINT talkx_campaigns_schedule_timezone_valid;
ALTER TABLE public.talkx_campaigns
  VALIDATE CONSTRAINT talkx_campaigns_send_window_valid;
ALTER TABLE public.talkx_campaigns
  VALIDATE CONSTRAINT talkx_campaigns_revision_positive;

RESET lock_timeout;
RESET statement_timeout;
