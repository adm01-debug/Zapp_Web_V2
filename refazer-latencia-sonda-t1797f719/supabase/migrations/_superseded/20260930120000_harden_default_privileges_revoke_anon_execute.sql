-- ============================================================================
-- Item 5 — auditoria adversarial, onda 2 (docs/audits/adversarial-f1-f2-f3-onda2-2026-09-29)
--
-- CAUSA-RAIZ: função nova nasce executável por `anon` porque o DEFAULT PRIVILEGES do bootstrap
-- do Supabase concede EXECUTE a `anon` por padrão (visto em pg_default_acl: `anon=X` em
-- defaclobjtype='f', tanto do role `postgres` quanto do `supabase_admin`). A auditoria contou
-- 9 funções em `public` executáveis por anon; hoje são 14, com as que outras frentes criaram.
--
-- CORREÇÃO: revoga o default para `anon`. Daqui em diante, função nova não é chamável por anon a
-- menos que haja GRANT explícito (menor privilégio; endpoint público passa a se declarar). Só
-- `anon` é revogado: `authenticated` continua com EXECUTE (é o papel do app).
--
-- CLASSE: contrato (revoke) — aplicada após merge/deploy.
-- ============================================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Higiene (zero risco de comportamento): as 6 trigger functions em `public` que `anon` "podia"
-- executar. Chamada direta a trigger function falha ("trigger functions can only be called as
-- triggers"), então revogar EXECUTE de `anon` nelas não muda nada em runtime — só as tira da
-- lista de superfície anon-executável. As funções utilitárias NÃO-trigger
-- (calculate_level, grant_agent_achievement, conversation_closure_day, persist_conversation_analysis,
-- replace_ai_conversation_tags, ai_is_canonical_priority, ai_is_canonical_sentiment, ai_text_array)
-- ficam DE FORA de propósito: se alguma é API pública intencional, é decisão do dono da feature,
-- não varredura cega.
REVOKE EXECUTE ON FUNCTION public.audit_contact_address_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.conversation_task_set_assignee() FROM anon;
REVOKE EXECUTE ON FUNCTION public.conversation_task_state_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_multiplix_dispatch_mutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_multiplix_recipient_mutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_receipts_fill_conversation_id() FROM anon;
