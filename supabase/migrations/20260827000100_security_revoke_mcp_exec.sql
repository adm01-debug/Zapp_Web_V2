-- Recuperado de supabase_migrations.schema_migrations.statements em 27/08/2026.
-- Aplicado direto no banco em 27/08/2026. Ver docs/MIGRATIONS.md e SECURITY-DB.md.
--
-- mcp_exec e mcp_exec_many sao SECURITY DEFINER e executam SQL arbitrario.
-- Sao infraestrutura do gateway MCP, nunca devem ser chamaveis pela aplicacao.

REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO service_role, postgres;
