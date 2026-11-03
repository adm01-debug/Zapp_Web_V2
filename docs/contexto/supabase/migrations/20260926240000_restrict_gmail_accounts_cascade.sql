ALTER TABLE public.gmail_accounts
  DROP CONSTRAINT gmail_accounts_user_id_fkey

ALTER TABLE public.gmail_accounts
  ADD CONSTRAINT gmail_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT
