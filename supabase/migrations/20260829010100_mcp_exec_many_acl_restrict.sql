-- Migration: mcp_exec_many_acl_restrict
-- Aplicada diretamente via MCP em 2026-08-29 01:01 UTC.
-- Conteudo recuperado do estado do banco (proacl em pg_proc).
--
-- CONTEXTO: mcp_exec_many envelopa mcp_exec em loop; sua ACL deve ser
-- identica — service_role e postgres somente. Sem este REVOKE, authenticated
-- poderia chamar mcp_exec_many e obter execucao arbitraria de SQL em batch.
-- Relacionado: 20260829010000_mcp_exec_acl_restrict.sql

REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO postgres;
GRANT  EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO service_role;
