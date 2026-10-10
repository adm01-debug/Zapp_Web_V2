-- Fix M-04: contacts.phone tinha dois UNIQUE constraints:
--   contacts_phone_key   — gerado pela constraint original (MANTIDO)
--   contacts_phone_unique — índice explícito redundante (REMOVIDO)
-- Cada INSERT/UPDATE em phone atualizava dois índices btree separados.
-- Drop da constraint também remove o índice subjacente automaticamente.
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_phone_unique;
