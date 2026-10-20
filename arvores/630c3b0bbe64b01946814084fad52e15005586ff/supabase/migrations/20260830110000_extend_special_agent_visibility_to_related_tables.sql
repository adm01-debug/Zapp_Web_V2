-- 20260830110000_extend_special_agent_visibility_to_related_tables
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 26: Estender visibilidade do special_agent para tabelas relacionadas à carteira
-- Padrão: contact_id IN (SELECT id FROM contacts WHERE assigned_to IN get_visible_agent_ids())
-- Aplicado em: contact_notes, conversation_events, conversation_sla, message_reactions

-- contact_notes: autores veem suas notas; admin/supervisor veem tudo; special_agent vê carteira estendida
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_notes' AND policyname='contact_notes_select_policy') THEN
    DROP POLICY "contact_notes_select_policy" ON public.contact_notes;
  END IF;
END $$;
CREATE POLICY "contact_notes_select_policy" ON public.contact_notes
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );

-- conversation_events: agente vê eventos de contatos da sua carteira (+ estendida)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_events' AND policyname='conversation_events_select_policy') THEN
    DROP POLICY "conversation_events_select_policy" ON public.conversation_events;
  END IF;
END $$;
CREATE POLICY "conversation_events_select_policy" ON public.conversation_events
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );

-- conversation_sla: visibilidade por carteira
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_sla' AND policyname='conversation_sla_select_policy') THEN
    DROP POLICY "conversation_sla_select_policy" ON public.conversation_sla;
  END IF;
END $$;
CREATE POLICY "conversation_sla_select_policy" ON public.conversation_sla
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );

-- message_reactions: visibilidade por carteira (user_id é auth.users.id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_reactions' AND policyname='message_reactions_select_policy') THEN
    DROP POLICY "message_reactions_select_policy" ON public.message_reactions;
  END IF;
END $$;
CREATE POLICY "message_reactions_select_policy" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR user_id = auth.uid()
    OR contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    )
  );
