-- ============================================================================
-- Item 5 (auditoria adversarial, onda 2) — CORREÇÃO da 20260930120000.
--
-- A 20260930120000 foi SUPERSEDED (movida para _superseded/) porque usava
-- `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, que exige SUPERUSER — e o caminho de
-- escrita de produção (mcp_exec, SECURITY DEFINER owner `postgres`) roda como `postgres`, que
-- este repo rebaixou (rolsuper=false) por endurecimento. Resultado: 42501 ao aplicar.
--
-- CORREÇÃO: basta o `ALTER DEFAULT PRIVILEGES` SEM `FOR ROLE`. Sem a cláusula, ele muda o default
-- do PRÓPRIO papel que roda a migration (`postgres`), que é exatamente o dono de TODAS as 225
-- funções em `public`. Ou seja: função nova criada por postgres deixa de nascer executável por
-- anon, salvo GRANT explícito. `supabase_admin` (que É superuser) não cria função em public aqui
-- (todas são de postgres), então o default dele é irrelevante — perder o `FOR ROLE` não perde nada.
--
-- CLASSE: contrato (revoke) — aplicada após merge/deploy.
-- ============================================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Higiene (zero risco de comportamento): as 6 trigger functions em `public` que `anon` "podia"
-- executar. Chamada direta a trigger function falha ("trigger functions can only be called as
-- triggers"), então revogar EXECUTE de `anon` nelas não muda nada em runtime — só as tira da lista
-- de superfície anon-executável. postgres é dono delas, então o REVOKE é permitido.
REVOKE EXECUTE ON FUNCTION public.audit_contact_address_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.conversation_task_set_assignee() FROM anon;
REVOKE EXECUTE ON FUNCTION public.conversation_task_state_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_multiplix_dispatch_mutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_multiplix_recipient_mutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_receipts_fill_conversation_id() FROM anon;
