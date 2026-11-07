SET search_path = public, extensions, pg_temp

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_search_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED

CREATE INDEX IF NOT EXISTS idx_contacts_phone_search_digits_trgm
  ON public.contacts USING gin (phone_search_digits extensions.gin_trgm_ops)

COMMENT ON COLUMN public.contacts.phone_search_digits IS
  'Somente dígitos de phone, gerados para busca consistente sem alterar o formato exibido.'
