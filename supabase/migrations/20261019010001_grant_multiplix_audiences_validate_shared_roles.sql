-- 20261019010001_grant_multiplix_audiences_validate_shared_roles.sql
-- Reconstrucao fiel do ledger: GRANT aplicado diretamente em 19/10/2026.
-- Nao altera o banco (versao ja registrada); apenas fecha a paridade
-- arquivo/ledger para desbloquear o preflight do db-migrate.yml.
-- Decisao pendente sobre EXECUTE para anon: item de seguranca separado.
GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO anon, authenticated;
