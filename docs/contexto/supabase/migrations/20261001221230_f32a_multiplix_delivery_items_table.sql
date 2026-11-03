CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.multiplix_recipients(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.multiplix_blocks(id) ON DELETE CASCADE,
  dispatch_version integer NOT NULL,
  status public.multiplix_item_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp with time zone,
  lease_token uuid,
  lease_until timestamp with time zone,
  worker_id text,
  external_id text,
  personalized_message text,
  provider_dispatch_started_at timestamp with time zone,
  idempotency_key text GENERATED ALWAYS AS (
    encode(
      extensions.digest(
        dispatch_id::text || ':' || dispatch_version::text || ':'
          || recipient_id::text || ':' || block_id::text,
        'sha256'
      ),
      'hex'
    )
  ) STORED,
  error_class text,
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_delivery_items_idempotency_key_key UNIQUE (idempotency_key)
)

CREATE INDEX idx_multiplix_delivery_items_queue
  ON public.multiplix_delivery_items (status, next_attempt_at)
  WHERE status IN ('pending', 'failed_transient')

CREATE INDEX idx_multiplix_delivery_items_dispatch_status
  ON public.multiplix_delivery_items (dispatch_id, status)

CREATE INDEX idx_multiplix_dispatches_created_by_created_at
  ON public.multiplix_dispatches (created_by, created_at DESC)

CREATE TRIGGER update_multiplix_delivery_items_updated_at
  BEFORE UPDATE ON public.multiplix_delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column()

ALTER TABLE public.multiplix_delivery_items ENABLE ROW LEVEL SECURITY

CREATE POLICY "Users can view delivery items of accessible dispatches"
  ON public.multiplix_delivery_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_delivery_items.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  )

REVOKE ALL ON public.multiplix_delivery_items FROM PUBLIC, anon, authenticated

GRANT SELECT ON public.multiplix_delivery_items TO authenticated

GRANT ALL ON public.multiplix_delivery_items TO service_role
