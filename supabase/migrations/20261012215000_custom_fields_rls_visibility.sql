-- custom_fields_rls_visibility
-- Rollback: restaura as 4 policies de contact_custom_fields ao predicado anterior (contato atribuido ao agente OU admin/supervisor), sem o ramo de fila/carteira.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Authenticated can view custom fields" on public.contact_custom_fields; create policy "Authenticated can view custom fields" on public.contact_custom_fields for select to authenticated using (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Users can insert custom fields for assigned contacts" on public.contact_custom_fields; create policy "Users can insert custom fields for assigned contacts" on public.contact_custom_fields for insert to authenticated with check (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Authenticated can update own custom fields" on public.contact_custom_fields; create policy "Authenticated can update own custom fields" on public.contact_custom_fields for update to authenticated using (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Authenticated can delete own custom fields" on public.contact_custom_fields; create policy "Authenticated can delete own custom fields" on public.contact_custom_fields for delete to authenticated using (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--
-- Campos personalizados de contato (Tela de Contato) decidiam QUEM ve/grava por um ramo
-- unico: contato ATRIBUIDO ao agente
--   contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()))
--   OR is_admin_or_supervisor(auth.uid())
-- Esse predicado ignora os ramos de FILA (queue_members) e de carteira concedida
-- (agent_visibility_grants) que o resto do sistema usa via is_contact_visible_to_user —
-- ja aplicado em conversation_analyses/ai_conversation_tags (20260930140000) e nas demais
-- superficies de contato.
--
-- Consequencia real: o agente que enxerga o contato SO por FILA abre a tela de contato
-- (o contato esta visivel), mas o SELECT/INSERT/UPDATE/DELETE em contact_custom_fields
-- devolve 0 linhas / barra a gravacao — os campos somem para quem pode ver o contato.
--
-- Correcao: alinhar as QUATRO policies (SELECT, INSERT, UPDATE, DELETE) ao MESMO predicado
-- do resto do sistema, public.is_contact_visible_to_user(contact_id, auth.uid()).
-- E superconjunto estrito do predicado atual:
--   * contato atribuido        -> get_visible_agent_ids() inclui o proprio profile e a carteira concedida;
--   * admin/supervisor         -> dentro do helper;
--   * ADICIONA fila (queue_members) e carteira (agent_visibility_grants);
--   * o helper e SECURITY DEFINER e exige _user_id = auth.uid() -> sem impersonacao.
-- Nomes das policies preservados; so o predicado muda (rollback = recriar as antigas).
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao.
-- Sem DML: nenhum dado tocado, nenhum gatilho disparado.

DROP POLICY IF EXISTS "Authenticated can view custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can view custom fields" ON public.contact_custom_fields
  FOR SELECT TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) );

DROP POLICY IF EXISTS "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields;
CREATE POLICY "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_contact_visible_to_user(contact_id, auth.uid()) );

DROP POLICY IF EXISTS "Authenticated can update own custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can update own custom fields" ON public.contact_custom_fields
  FOR UPDATE TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) )
  WITH CHECK ( public.is_contact_visible_to_user(contact_id, auth.uid()) );

DROP POLICY IF EXISTS "Authenticated can delete own custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can delete own custom fields" ON public.contact_custom_fields
  FOR DELETE TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) );
