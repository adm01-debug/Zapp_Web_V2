-- Fecha privilégios de estrutura que ignoram RLS nas tabelas de public.
--
-- Diagnóstico read-only em 2026-10-30 no banco canônico:
--   * anon: TRUNCATE/REFERENCES/TRIGGER em 89 tabelas de public;
--   * authenticated: os mesmos privilégios em 130 tabelas.
--
-- A migration 20261016250000 removeu INSERT/UPDATE/DELETE de anon, mas não
-- estes privilégios. TRUNCATE ignora RLS e pode apagar tabelas inteiras; a
-- aplicação não cria triggers nem FKs como anon/authenticated. Mantemos os
-- grants de SELECT e DML que já fazem parte dos contratos do produto.
--
-- Os defaults de supabase_admin são um residual externo já documentado: o
-- executor de migrations do projeto não é superuser nem membro de
-- supabase_admin. O guard live verificará os grants efetivos em objetos
-- existentes; os defaults de postgres, que são controláveis pelo owner, ficam
-- corrigidos aqui.

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM PUBLIC, anon, authenticated;
