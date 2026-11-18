CREATE TABLE IF NOT EXISTS public.multiplix_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id    uuid        NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE RESTRICT,
  recipient_id   uuid                 REFERENCES public.multiplix_recipients(id) ON DELETE RESTRICT,
  item_id        uuid,
  kind           text        NOT NULL,
  payload        jsonb,
  correlation_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_events_kind_check CHECK (kind IN (
    'dispatch_created','dispatch_scheduled','dispatch_started','dispatch_paused','dispatch_resumed',
    'dispatch_completed','dispatch_failed','dispatch_cancelled',
    'recipient_queued','recipient_claimed','recipient_sent','recipient_delivered','recipient_read',
    'recipient_failed','recipient_skipped','recipient_cancelled','recipient_outcome_unknown',
    'item_queued','item_claimed','item_sent','item_delivered','item_read','item_failed',
    'item_rescheduled','item_dead_letter','item_skipped','item_cancelled',
    'note'
  ))
)

CREATE INDEX IF NOT EXISTS idx_multiplix_events_dispatch_created
  ON public.multiplix_events (dispatch_id, created_at DESC)

CREATE INDEX IF NOT EXISTS idx_multiplix_events_recipient
  ON public.multiplix_events (recipient_id) WHERE recipient_id IS NOT NULL

CREATE INDEX IF NOT EXISTS idx_multiplix_events_correlation
  ON public.multiplix_events (correlation_id) WHERE correlation_id IS NOT NULL

ALTER TABLE public.multiplix_events ENABLE ROW LEVEL SECURITY

DROP POLICY IF EXISTS "Users can view events of accessible dispatches" ON public.multiplix_events

CREATE POLICY "Users can view events of accessible dispatches" ON public.multiplix_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_events.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  )

REVOKE ALL ON TABLE public.multiplix_events FROM PUBLIC, anon, authenticated, service_role

GRANT SELECT ON TABLE public.multiplix_events TO authenticated

GRANT SELECT, INSERT, UPDATE ON TABLE public.multiplix_events TO service_role

CREATE OR REPLACE FUNCTION public.guard_multiplix_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_any_unlink boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'multiplix_event_delete_denied' USING ERRCODE = '55000';
  END IF;

  -- TG_OP = 'UPDATE'
  v_any_unlink :=
       (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL)
    OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL)
    OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL);

  IF v_any_unlink
     AND (NEW.id             IS NOT DISTINCT FROM OLD.id)
     AND (NEW.kind           IS NOT DISTINCT FROM OLD.kind)
     AND (NEW.payload        IS NOT DISTINCT FROM OLD.payload)
     AND (NEW.correlation_id IS NOT DISTINCT FROM OLD.correlation_id)
     AND (NEW.created_at     IS NOT DISTINCT FROM OLD.created_at)
     AND ((NEW.dispatch_id  IS NOT DISTINCT FROM OLD.dispatch_id)
          OR (OLD.dispatch_id  IS NOT NULL AND NEW.dispatch_id  IS NULL))
     AND ((NEW.recipient_id IS NOT DISTINCT FROM OLD.recipient_id)
          OR (OLD.recipient_id IS NOT NULL AND NEW.recipient_id IS NULL))
     AND ((NEW.item_id      IS NOT DISTINCT FROM OLD.item_id)
          OR (OLD.item_id      IS NOT NULL AND NEW.item_id      IS NULL))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'multiplix_event_immutable' USING ERRCODE = '55000';
END;
$function$

DROP TRIGGER IF EXISTS trg_guard_multiplix_event_immutable ON public.multiplix_events

CREATE TRIGGER trg_guard_multiplix_event_immutable
BEFORE UPDATE OR DELETE ON public.multiplix_events
FOR EACH ROW EXECUTE FUNCTION public.guard_multiplix_event_immutable()

REVOKE ALL ON FUNCTION public.guard_multiplix_event_immutable() FROM PUBLIC, anon, authenticated

COMMENT ON TABLE public.multiplix_events IS
  'Trilha append-only do motor de envio Multiplix (F34). So cresce: DELETE sempre rejeitado e '
  'UPDATE so e aceito quando seu unico efeito e zerar uma FK (trigger guard_multiplix_event_immutable). '
  'FKs: dispatch_id e recipient_id ON DELETE RESTRICT (evento e registro historico).'

COMMENT ON COLUMN public.multiplix_events.kind IS
  'Tipo do evento. Vocabulario inicial (text+CHECK): dispatch_*/recipient_*/item_* + note. Evolui por migration.'

COMMENT ON COLUMN public.multiplix_events.payload IS
  'Dados do evento (livre). Nao guardar segredo/PII: a leitura por authenticated passa pela RLS do dispatch.'
