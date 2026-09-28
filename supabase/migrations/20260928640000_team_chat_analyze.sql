-- E50: ANALYZE nas tabelas team_chat para atualizar estatisticas do planner apos todas as migrations
-- VACUUM ANALYZE nao pode rodar em transacao; este arquivo e executado separadamente via db_query
-- ou pelo DBA apos o apply das migrations anteriores.
-- Por enquanto apenas documenta a necessidade.

-- Comentario para o DBA: apos aplicar todas as migrations do Bloco C,
-- rodar manualmente:
-- ANALYZE public.team_conversations;
-- ANALYZE public.team_conversation_members;
-- ANALYZE public.team_messages;
-- ANALYZE public.team_message_reactions;
-- ANALYZE public.team_message_receipts;
-- ANALYZE public.departments;
-- ANALYZE public.department_invitations;
-- ANALYZE public.department_audit_logs;

SELECT 1; -- placeholder para arquivo nao vazio
