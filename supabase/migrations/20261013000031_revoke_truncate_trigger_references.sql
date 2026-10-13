-- revoke_truncate_trigger_references
-- Rollback: GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO anon, authenticated; GRANT INSERT, UPDATE, DELETE ON public.contact_custom_fields TO anon; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO anon, authenticated;
-- Classe: ACL (nenhum dado removido, nenhuma policy criada ou alterada).
-- Achado da auditoria de paridade V3 -> V2 (docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md):
-- o padrao do Supabase deixa anon/authenticated com TRUNCATE, TRIGGER e REFERENCES em TODA
-- tabela de public. Sao privilegios que NAO passam pela RLS: TRUNCATE esvazia a tabela sem
-- consultar policy, TRIGGER permite criar gatilho (DDL) e REFERENCES permite criar FK apontando
-- para a tabela. A API REST nao os expoe hoje, mas ficam ao alcance de qualquer SQL direto.
-- Estado medido no banco LOCAL da tarefa (2026-10-12, dono postgres em todas as 181 relacoes):
--   anon          = 116 tabelas com os 3 privilegios;
--   authenticated = 133 tabelas com os 3 privilegios.
-- Esta migration revoga os 3 em TODAS as relacoes de public de uma vez (REVOKE e idempotente,
-- entao repete sem conflito o subconjunto ja coberto por cartoes anteriores: contatos 17 tabelas,
-- tarefas/e-mail/ligacoes N-145, views de conexoes E44).
-- contact_custom_fields: alem dos 3, anon ainda tinha INSERT, UPDATE e DELETE; a tabela so tem
-- policy TO authenticated (sem policy para anon), entao a RLS nunca autorizou escrita publica --
-- o grant era inerte, mas desnecessario. Revogado so ali (as outras 116 tabelas continuam com
-- INSERT/UPDATE/DELETE para anon, bloqueados pela RLS: ver lista no relato do cartao).
-- service_role NAO e tocado.
SET search_path = public;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.contact_custom_fields FROM anon;
-- Para tabelas NOVAS criadas pelo dono atual (postgres): nao herdar os 3 privilegios.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
