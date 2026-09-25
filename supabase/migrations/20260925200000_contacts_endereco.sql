-- Endereço do contato: o cadastro só tinha telefone, então qualquer visão geográfica
-- (ex.: o mapa de contatos) era aproximada pelo DDD. Colunas aditivas e opcionais —
-- nenhum contato existente muda.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN public.contacts.postal_code IS 'CEP, só dígitos (8 caracteres)';
COMMENT ON COLUMN public.contacts.address IS 'Logradouro (rua, avenida)';
COMMENT ON COLUMN public.contacts.address_number IS 'Número; texto porque aceita S/N';
COMMENT ON COLUMN public.contacts.neighborhood IS 'Bairro';
COMMENT ON COLUMN public.contacts.city IS 'Cidade';
COMMENT ON COLUMN public.contacts.state IS 'UF com 2 letras';
