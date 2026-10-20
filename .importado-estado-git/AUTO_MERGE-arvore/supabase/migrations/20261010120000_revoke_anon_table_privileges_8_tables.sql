-- ============================================================================
-- revogar permissoes de tabela de anon e authenticated nas 8 tabelas
--
-- Problema (SEC-RLS_TAREFAS_EMAIL_LIGACOES-03):
--   Visitante sem login (anon) ainda tem permissao de tabela (incluindo
--   DELETE e TRUNCATE) em 8 tabelas. A regra RLS de acesso barra, mas a
--   permisso de tabela e uma porta destrancada.
--
-- Correcao: REVOKE ALL ON TABLES FROM anon e REVOKE TRUNCATE, REFERENCES,
--   TRIGGER ON TABLES FROM authenticated para cada uma das 8 tabelas.
--
-- Rollback: re-executar os GRANTs originais (se houver) ou usar
--   ALTER DEFAULT PRIVILEGES para restaurar o estado anterior.
-- ============================================================================

-- 1. Revogar TODAS as permissoes de tabela de anon nas 8 tabelas
REVOKE ALL ON TABLE public.calls FROM anon;
REVOKE ALL ON TABLE public.conversation_tasks FROM anon;
REVOKE ALL ON TABLE public.deal_activities FROM anon;
REVOKE ALL ON TABLE public.email_messages FROM anon;
REVOKE ALL ON TABLE public.email_threads FROM anon;
REVOKE ALL ON TABLE public.gmail_accounts FROM anon;
REVOKE ALL ON TABLE public.sales_deals FROM anon;
REVOKE ALL ON TABLE public.user_settings FROM anon;

-- 2. Revogar TRUNCATE, REFERENCES e TRIGGER de authenticated nas 8 tabelas
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calls FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.conversation_tasks FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.deal_activities FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.email_messages FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.email_threads FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.gmail_accounts FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_deals FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_settings FROM authenticated;
