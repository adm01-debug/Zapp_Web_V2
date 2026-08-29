-- Migration: mcp_exec_acl_restrict
-- Aplicada diretamente via MCP em 2026-08-29 01:00 UTC.
-- Conteudo recuperado do estado do banco (proacl em pg_proc).
--
-- CONTEXTO: mcp_exec e SECURITY DEFINER e executa SQL arbitrario para o
-- gateway MCP. Acesso deve ser restrito a service_role (backend/cron) e
-- postgres apenas. Remover authenticated/anon previne escalada de privilegio
-- via Supabase client SDK (authenticated pode construir payloads maliciosos).
-- Relacionado: PR fix/catalog-columns-acl-20260829
--              scripts/db-audit/check-mcp-exec-acl.sql

REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO postgres;
GRANT  EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO service_role;
