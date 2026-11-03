REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM authenticated, anon, PUBLIC

REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM authenticated, anon, PUBLIC

GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO service_role, postgres

GRANT EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO service_role, postgres
