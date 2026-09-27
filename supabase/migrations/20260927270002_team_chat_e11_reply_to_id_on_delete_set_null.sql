-- E11: Fix reply_to_id FK — change NO ACTION → ON DELETE SET NULL
-- Bug: deleting a replied-to message raised FK violation instead of clearing reply ref
ALTER TABLE public.team_messages
  DROP CONSTRAINT IF EXISTS team_messages_reply_to_id_fkey;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_reply_to_id_fkey
  FOREIGN KEY (reply_to_id)
  REFERENCES public.team_messages(id)
  ON DELETE SET NULL;
