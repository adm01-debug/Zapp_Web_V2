-- contacts_phone_search_digits
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_contacts_phone_search_digits_trgm;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS phone_search_digits;
--
-- `contacts.phone` contém legado com e sem máscara. Normalizar apenas o termo no
-- cliente não faz `5541` casar com `+55 (41)`. A coluna gerada mantém os dados
-- originais de exibição e oferece uma superfície canônica/indexada de busca.

SET search_path = public, extensions, pg_temp;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_search_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_search_digits_trgm
  ON public.contacts USING gin (phone_search_digits extensions.gin_trgm_ops);

COMMENT ON COLUMN public.contacts.phone_search_digits IS
  'Somente dígitos de phone, gerados para busca consistente sem alterar o formato exibido.';
