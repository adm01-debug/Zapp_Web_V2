DO $pub$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches';
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients';
END
$pub$

DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches

DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients

DROP POLICY IF EXISTS "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks

DROP POLICY IF EXISTS "Users can update blocks of own draft dispatches" ON public.multiplix_blocks

DROP POLICY IF EXISTS "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks

CREATE TYPE public.multiplix_dispatch_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'paused',
  'completed',
  'completed_with_failures',
  'failed',
  'cancelled'
)

CREATE TYPE public.multiplix_recipient_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
  'cancelled',
  'outcome_unknown'
)

CREATE TYPE public.multiplix_item_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'failed_transient',
  'skipped',
  'cancelled',
  'outcome_unknown'
)

CREATE TYPE public.multiplix_block_type AS ENUM (
  'text',
  'voice_ai',
  'audio_recorded',
  'file'
)

CREATE TYPE public.multiplix_eligibility AS ENUM (
  'eligible',
  'no_destination',
  'suppressed',
  'out_of_scope',
  'media_pending',
  'connection_unavailable',
  'requires_template'
)

ALTER TABLE public.multiplix_dispatches
  DROP CONSTRAINT IF EXISTS multiplix_dispatches_status_check

ALTER TABLE public.multiplix_dispatches
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.multiplix_dispatch_status
    USING status::public.multiplix_dispatch_status,
  ALTER COLUMN status SET DEFAULT 'draft'::public.multiplix_dispatch_status

ALTER TABLE public.multiplix_recipients
  DROP CONSTRAINT IF EXISTS multiplix_recipients_delivery_claim_state

ALTER TABLE public.multiplix_recipients
  DROP CONSTRAINT IF EXISTS multiplix_recipients_status_check

DROP INDEX IF EXISTS public.idx_multiplix_recipients_pending

ALTER TABLE public.multiplix_recipients
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.multiplix_recipient_status
    USING status::public.multiplix_recipient_status,
  ALTER COLUMN status SET DEFAULT 'pending'::public.multiplix_recipient_status

ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_delivery_claim_state
    CHECK (
      (status = 'sending' AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL
        AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL)
      OR
      (status <> 'sending' AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL
        AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)
    )

CREATE INDEX idx_multiplix_recipients_pending
  ON public.multiplix_recipients (dispatch_id)
  WHERE (status = 'pending')

ALTER TABLE public.multiplix_blocks
  DROP CONSTRAINT IF EXISTS multiplix_blocks_block_type_check

ALTER TABLE public.multiplix_blocks
  ALTER COLUMN block_type TYPE public.multiplix_block_type
    USING (
      CASE block_type
        WHEN 'voice' THEN 'voice_ai'
        ELSE block_type
      END
    )::public.multiplix_block_type

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."multiplix_dispatches" (
  id, name, status, total_recipients, sent_count, failed_count, delivered_count,
  outcome_unknown_count, started_at, paused_at, pause_reason, completed_at,
  scheduled_at, whatsapp_connection_id, created_by, created_at, updated_at
)

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."multiplix_recipients" (
  id, dispatch_id, company_id, company_name_snapshot, destino_origem, status,
  sent_at, delivered_at, error_message, delivery_claimed_at, delivery_claim_expires_at,
  delivery_claimed_by, delivery_attempt_count, created_at, updated_at, attempt_count,
  retry_after, provider_dispatch_started_at, external_id
)

CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  )

CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

CREATE POLICY "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

CREATE POLICY "Users can update blocks of own draft dispatches" ON public.multiplix_blocks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

CREATE POLICY "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
