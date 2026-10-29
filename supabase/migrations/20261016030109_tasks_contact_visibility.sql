-- tasks_contact_visibility
-- Rollback: dropa a policy ADITIVA tasks_select_contact_visible; nada mais e tocado (sem coluna, funcao, grant ou dado).
-- Rollback (SQL executável, na ordem):
--   drop policy if exists tasks_select_contact_visible on public.conversation_tasks;
--
-- DEFEITO (auditoria de paridade V3 -> V2, doc docs/estado/10-features-inbox-components-raiz-a-m.md):
-- a policy tasks_select_own (20260928140000_tasks_unify_reminders_kanban.sql:131-137) so entrega a
-- tarefa ao CRIADOR ou a admin/supervisor, e o gatilho trg_task_set_assignee forca
-- assigned_to := created_by no INSERT (:105-117). Ao transferir a conversa, o novo responsavel
-- nao enxerga os follow-ups deixados pelo anterior e a aba Tarefas do chat aparece vazia.
--
-- CORRECAO (ADITIVA): uma policy de SELECT A MAIS. Policies PERMISSIVE se somam por OR, entao
-- nada do que ja era visivel muda; o que entra e a visibilidade por CONTATO. Tarefa ligada a um
-- contato passa a ser legivel por quem enxerga aquele contato (public.is_contact_visible_to_user,
-- o predicado canonico do repo, SECURITY DEFINER com SET search_path fixo). Tarefa pessoal
-- (contact_id IS NULL) segue privada: a policy exige contact_id IS NOT NULL e
-- is_contact_visible_to_user(NULL, ...) e falso de qualquer forma.
--
-- NAO MUDA: tasks_update_own / tasks_delete_own continuam restritas ao dono ou admin/supervisor
-- (por isso ver a tarefa do contato nao da o direito de edita-la), e o gatilho
-- trg_prevent_conversation_task_field_forgery segue barrando troca de responsavel/criador por
-- quem nao e admin/supervisor. O gatilho de assigned_to NAO e tocado.
--
-- GRANT/REVOKE: nenhum. Este arquivo nao cria funcao nem muda ACL de objeto existente.
-- SET search_path: nao se aplica aqui — a policy apenas CHAMA is_contact_visible_to_user(uuid, uuid),
-- que ja carrega SET search_path = public, pg_temp (20260909200000_harden_inbox_contact_authorization.sql:55-63).
--
-- Por que o DROP antes do CREATE: as migrations do repo sao reaplicadas do zero no db-guard; o
-- par DROP IF EXISTS + CREATE deixa o arquivo idempotente no replay. O DROP nao remove nada que
-- exista hoje (a policy e nova, criada por este arquivo).

BEGIN;

DROP POLICY IF EXISTS tasks_select_contact_visible ON public.conversation_tasks;

CREATE POLICY tasks_select_contact_visible ON public.conversation_tasks
  FOR SELECT TO authenticated
  USING (
    contact_id IS NOT NULL
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

COMMIT;
