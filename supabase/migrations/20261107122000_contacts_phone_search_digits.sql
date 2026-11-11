SET search_path = public, pg_temp;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_search_digits text
  GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS contacts_phone_search_digits_trgm_idx
  ON public.contacts
  USING gin (phone_search_digits extensions.gin_trgm_ops);
