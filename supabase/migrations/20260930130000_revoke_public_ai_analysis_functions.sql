-- Endurecimento de ACL (continuacao de 20260930113613_revoke_anon_default_privileges_and_gamification_rpcs).
--
-- Depois daquele REVOKE, a verificacao no banco canonico mediu que ainda restavam
-- 5 funcoes de analise de IA com EXECUTE para PUBLIC (e, por consequencia, para
-- anon) em public:
--   ai_is_canonical_priority, ai_is_canonical_sentiment, ai_text_array,
--   persist_conversation_analysis, replace_ai_conversation_tags
-- A assercao 01-SEC-03 do proprio repo (scripts/db-tests/01-security-grants.sql)
-- exige ZERO EXECUTE PUBLIC em funcoes de negocio; essas 5 vinham de trabalho de
-- outro chat sobre analise de conversas e nao foram cobertas.
--
-- Risco destas comparado ao grant_agent_achievement: elas sao SECURITY INVOKER
-- (prosecdef = false), entao rodam com o privilegio de quem chama -- um anon que
-- as chamasse cairia nas policies de RLS. E o caso de limpeza/higiene de ACL, nao
-- de escalada. Mesmo assim, PUBLIC em funcao de negocio e exposição desnecessaria
-- (e o projeto ja decidiu, por assercao propria, que nao deve existir).
--
-- Escopo: apenas EXECUTE dessas 5 funcoes. Verificado antes de escrever:
-- has_function_privilege('authenticated', oid, 'EXECUTE') = true nas 5, entao
-- chamada legitima do app continua funcionando; nenhum objeto de tabela e tocado.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura,
           (p.prorettype = 'trigger'::regtype) AS e_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'ai_is_canonical_priority', 'ai_is_canonical_sentiment', 'ai_text_array',
         'persist_conversation_analysis', 'replace_ai_conversation_tags'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.assinatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.assinatura);
    IF NOT r.e_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.assinatura);
    END IF;
  END LOOP;
END $$;
