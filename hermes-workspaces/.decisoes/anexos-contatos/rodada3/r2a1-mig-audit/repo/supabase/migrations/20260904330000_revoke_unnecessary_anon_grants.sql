-- 20260904330000_revoke_unnecessary_anon_grants
--
-- Reconstituido retroativamente: aplicado direto em producao via MCP em
-- 2026-09-04 (sessao paralela), sem virar arquivo no repo na epoca. Achado
-- na auditoria exaustiva de 2026-09-25 ao varrer schema_migrations por
-- `name` duplicado sem exceção pinned em scripts/db-audit/migration-evidence.json
-- (diferente de 20260903260000_revoke_unnecessary_anon_grants.sql, que e uma
-- migration distinta que por coincidencia ocupou o mesmo `name` no ledger).
--
-- Confirmado byte a byte contra o ledger (schema_migrations.statements) e
-- contra a ACL viva (has_function_privilege): nem anon, nem authenticated,
-- nem PUBLIC tem EXECUTE nestas duas funcoes hoje.
--
-- calculate_level(integer) e normalize_contact_phone() nao tem motivo para
-- ser chamaveis diretamente por cliente (anon ou authenticated) — sao
-- funcoes de apoio internas (calculo de nivel/gamificacao e normalizacao de
-- telefone), usadas via trigger ou pela camada de servidor.

REVOKE EXECUTE ON FUNCTION public.calculate_level(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM anon, authenticated;
