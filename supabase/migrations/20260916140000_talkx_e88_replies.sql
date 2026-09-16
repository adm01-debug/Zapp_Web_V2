-- E88 · Respostas reais: replied_at, reply_message_id, replied_count + trigger

ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS replied_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reply_message_id  uuid REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS replied_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_talkx_recipients_reply_lookup
  ON public.talkx_recipients (contact_id, sent_at DESC)
  WHERE replied_at IS NULL AND sent_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_talkx_increment_replied_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF OLD.replied_at IS NULL AND NEW.replied_at IS NOT NULL THEN
    UPDATE public.talkx_campaigns
       SET replied_count = COALESCE(replied_count, 0) + 1
     WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talkx_replied_count ON public.talkx_recipients;

CREATE TRIGGER trg_talkx_replied_count
  AFTER UPDATE OF replied_at ON public.talkx_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_talkx_increment_replied_count();
