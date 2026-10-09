-- Rollback:
-- DROP FUNCTION IF EXISTS public.e2e_cleanup_conversation_closures();
--
-- Producao ficou sem a limpeza E2E quando o contato de teste
-- registrou um closure que o curl com service_role nao alcançou
-- (a migration 20261003152707 aplicou uma vez, mas o teardown
-- do e2e-logado.yml continua usando service_role — esta função
-- substitui esse curl por uma RPC SECURITY DEFINER que só apaga
-- o contato fixture e exige o JWT do usuário de teste).

CREATE OR REPLACE FUNCTION public.e2e_cleanup_conversation_closures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rows integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Apenas usuarios autenticados podem executar esta funcao';
    END IF;

    DELETE FROM public.conversation_closures
    WHERE contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_cleanup_conversation_closures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_cleanup_conversation_closures() TO authenticated;