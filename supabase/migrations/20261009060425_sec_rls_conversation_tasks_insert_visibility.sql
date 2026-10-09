-- sec_rls_conversation_tasks_insert_visibility
-- Rollback: DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
-- Rollback: CREATE POLICY tasks_insert_own ON public.conversation_tasks FOR INSERT TO authenticated WITH CHECK ( created_by = public.current_profile_id() );
--
-- SEC-RLS_CONTATOS_MENSAGENS-06 (P2): `tasks_insert_own` validava so `created_by = current_profile_id()`,
-- entao qualquer agente (sabendo o UUID) gravava tarefa apontando para contato fora do seu alcance.
-- O guard de forja (`trg_prevent_conversation_task_field_forgery`) e BEFORE UPDATE e nao cobre o INSERT.
-- Aqui o INSERT passa a exigir a MESMA visibilidade de contato que o trigger ja exige no UPDATE
-- (`is_contact_visible_to_user`); tarefa sem contato (contact_id NULL, caso do /remind) continua livre.

DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
    AND (
      contact_id IS NULL
      OR public.is_contact_visible_to_user(contact_id, auth.uid())
    )
  );
