-- ADR-005 Step 1: Persist conversation status on contacts table
-- Flag inbox.status-fsm controls whether UI reads this field (off by default).

ALTER TABLE public.contacts
  ADD COLUMN conversation_status TEXT NOT NULL DEFAULT 'open'
    CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'));

ALTER TABLE public.contacts
  ADD COLUMN conversation_status_changed_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.set_conversation_status(
  p_contact_id UUID,
  p_next TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current
  FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  IF v_current = 'open'     AND p_next IN ('waiting','resolved','archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open','resolved','archived')    THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open','archived')               THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                             THEN v_allowed := TRUE; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
  END IF;

  UPDATE public.contacts
  SET conversation_status = p_next,
      conversation_status_changed_at = NOW()
  WHERE id = p_contact_id;

  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Backfill: resolved — contacts with closure more recent than last message
UPDATE public.contacts c
SET conversation_status = 'resolved',
    conversation_status_changed_at = cc.last_closure
FROM (
  SELECT contact_id, MAX(created_at) AS last_closure
  FROM public.conversation_closures
  GROUP BY contact_id
) cc
WHERE c.id = cc.contact_id
  AND c.conversation_status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.contact_id = c.id AND m.created_at > cc.last_closure
  );

-- Backfill: waiting — contacts with messages and no assigned_to
UPDATE public.contacts
SET conversation_status = 'waiting',
    conversation_status_changed_at = NOW()
WHERE conversation_status = 'open'
  AND assigned_to IS NULL
  AND EXISTS (SELECT 1 FROM public.messages m WHERE m.contact_id = id);
