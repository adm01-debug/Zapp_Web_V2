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
