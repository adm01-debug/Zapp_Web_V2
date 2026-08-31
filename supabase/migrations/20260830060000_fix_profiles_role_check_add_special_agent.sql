-- 20260830060000_fix_profiles_role_check_add_special_agent
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 9: Corrigir CHECK profiles_role_check para aceitar special_agent (F04)
-- Sem isso, qualquer INSERT/UPDATE em profiles com role=special_agent falha.
-- Este step PRECEDE o trigger de sync (step 10).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'supervisor'::text,
    'agent'::text,
    'special_agent'::text
  ]));
