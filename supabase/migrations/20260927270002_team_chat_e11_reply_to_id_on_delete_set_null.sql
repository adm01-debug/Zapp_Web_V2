ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_reply_to_id_fkey;

ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.team_messages(id) ON DELETE SET NULL;
