-- FIX-S03-001: mcp_exec — SQL dinamico arbitrario com excecoes silenciadas
-- Problema: funcao publica.mcp_exec executa EXECUTE com SQL arbitrario, silencia excecoes
--           via EXCEPTION WHEN OTHERS THEN NULL, e re-executa DML.
--           Grants: postgres (EXECUTE), service_role (EXECUTE).
--           Risco: SQL injection interno; falhas silenciosas mascaram bugs em producao.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM
-- Aplicar apenas apos confirmar que nenhum fluxo de producao depende do comportamento atual.

-- CORRECAO 1: Adicionar logging de erros em vez de silenciar
-- Este e um SQL de REFERENCIA — a implementacao real depende do corpo atual da funcao.

-- EXEMPLO DE CORRECAO DO BLOCO DE EXCECAO:
/*
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.audit_logs(action, entity_type, metadata, created_at)
  VALUES (
    'mcp_exec_error',
    'system',
    jsonb_build_object(
      'sql_hash', md5(p_sql),
      'error_code', SQLSTATE,
      'error_message', SQLERRM
    ),
    now()
  );
  RAISE WARNING 'mcp_exec error [%]: %', SQLSTATE, SQLERRM;
*/

-- CORRECAO 2: Revogar acesso em producao se funcao nao for mais necessaria
-- REVOKE EXECUTE ON FUNCTION public.mcp_exec(text) FROM service_role;
-- REVOKE EXECUTE ON FUNCTION public.mcp_exec(text) FROM postgres;

-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public.mcp_exec(text) TO postgres;
-- GRANT EXECUTE ON FUNCTION public.mcp_exec(text) TO service_role;

-- RISCO DE REGRESSAO: ALTO
-- O fluxo de registro de migrations via MCP usa esta funcao (ver CLAUDE.md secao 1).
-- Qualquer alteracao deve ser testada no banco local antes de aplicar em producao.
