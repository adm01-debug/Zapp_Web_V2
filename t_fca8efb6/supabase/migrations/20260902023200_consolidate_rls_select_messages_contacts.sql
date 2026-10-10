-- Consolida policies SELECT duplicadas/sobrepostas em messages e contacts.
--
-- Antes: messages tinha 2 policies SELECT permissivas ("Users can view messages from
-- their assigned contacts" e "messages_select_policy") que o Postgres combina com OR.
-- A união das duas cobre 3 casos distintos: admin/supervisor, assigned_to visível
-- (incluindo agent_visibility_grants de special_agent), e membro ativo da fila do
-- contato. Nenhuma das duas policies sozinha cobria os 3 casos.
--
-- contacts tinha uma policy redundante ("Admins can view all contacts including
-- unassigned", has_role(_,'admin')) estritamente subsumida por contacts_select_policy
-- (is_admin_or_supervisor, que já inclui admin) — removida sem substituição.
--
-- Validado em produção via impersonação (set_config('request.jwt.claims', ...)) com
-- os 4 usuários reais do sistema: contagens de messages/contacts visíveis idênticas
-- antes e depois da consolidação (1105 contacts / 11410 messages para todos, batendo
-- com o total irrestrito via service_role).

DROP POLICY IF EXISTS "Users can view messages from their assigned contacts" ON public.messages;
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;

CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
        SELECT c.id FROM public.contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
    OR EXISTS (
        SELECT 1 FROM public.contacts c
        JOIN public.queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = messages.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
  );

DROP POLICY IF EXISTS "Admins can view all contacts including unassigned" ON public.contacts;
