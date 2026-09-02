-- Recuperado de supabase_migrations.schema_migrations.statements em 27/08/2026.
-- Aplicado direto no banco em 27/08/2026. Ver docs/MIGRATIONS.md e SECURITY-DB.md.
--
-- mcp_exec e mcp_exec_many sao SECURITY DEFINER e executam SQL arbitrario.
-- Sao infraestrutura do gateway MCP, nunca devem ser chamaveis pela aplicacao.
--
-- Guard idempotente: mcp_exec/mcp_exec_many sao infraestrutura do gateway MCP,
-- provisionada fora do fluxo de migrations (nao existe CREATE FUNCTION para
-- elas neste repo). Um replay do zero (disaster recovery) nunca tera essas
-- funcoes, entao REVOKE/GRANT direto falha com SQLSTATE 42883
-- (undefined_function). Os blocos DO toleram a ausencia; em producao, onde as
-- funcoes existem, o efeito e identico ao DDL original.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM authenticated, anon, PUBLIC;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM authenticated, anon, PUBLIC;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END
$$;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO service_role, postgres;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END
$$;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO service_role, postgres;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END
$$;
