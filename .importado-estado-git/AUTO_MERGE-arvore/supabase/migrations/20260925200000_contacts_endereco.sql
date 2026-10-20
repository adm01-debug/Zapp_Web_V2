-- Reconciliacao (2026-09-25): DDL ja aplicado ao vivo em producao (registro
-- 20260925200000 em supabase_migrations.schema_migrations) antes de existir
-- arquivo de migration versionado. Corpo SQL abaixo e copia exata da
-- statement do ledger (nao alterado) — canonicamente identico ao que ja
-- roda no banco oficial.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;
