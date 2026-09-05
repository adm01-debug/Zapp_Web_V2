-- FSM trigger: enforce valid conversation_status transitions on contacts
-- Valid states: open, waiting, resolved, archived
-- Valid transitions:
--   open     -> waiting | resolved | archived
--   waiting  -> open | resolved
--   resolved -> open | archived
--   archived -> open

CREATE OR REPLACE FUNCTION enforce_conversation_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op when status is unchanged (WHEN clause already guards, but defensive)
  IF OLD.conversation_status = NEW.conversation_status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open')
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_contacts_fsm_transition
BEFORE UPDATE ON contacts
FOR EACH ROW
WHEN (OLD.conversation_status IS DISTINCT FROM NEW.conversation_status)
EXECUTE FUNCTION enforce_conversation_status_transition();

-- Partial index: accelerates queries on active (non-resolved, non-archived) conversations
CREATE INDEX idx_contacts_conv_status_active
  ON contacts(conversation_status)
  WHERE conversation_status NOT IN ('resolved', 'archived');
