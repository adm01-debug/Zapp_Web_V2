-- rls_scheduled_whisper_visibility
-- Rollback: recria as policies ANTERIORES de INSERT/UPDATE de scheduled_messages e de INSERT de whisper_messages (abaixo).
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "Users can create scheduled messages" on public.scheduled_messages;
--   create policy "Users can create scheduled messages" on public.scheduled_messages for insert to authenticated with check (created_by in (select id from public.profiles where user_id = auth.uid()) or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Users can update their scheduled messages" on public.scheduled_messages;
--   create policy "Users can update their scheduled messages" on public.scheduled_messages for update to authenticated using (created_by in (select id from public.profiles where user_id = auth.uid()) or public.is_admin_or_supervisor(auth.uid()));
--   drop policy if exists "Users can insert own whisper messages" on public.whisper_messages;
--   create policy "Users can insert own whisper messages" on public.whisper_messages for insert to authenticated with check (sender_id in (select id from public.profiles where user_id = auth.uid()) or public.is_admin_or_supervisor(auth.uid()));
--
-- Auditoria de paridade V3->V2 (achado chat-2, CONFIRMADO no banco vivo em 11/10/2026):
--   * INSERT de public.scheduled_messages só exigia created_by = perfil do chamador (ou
--     admin/supervisor): não checava se o contato é visível nem a permissão de envio.
--   * UPDATE de public.scheduled_messages não tinha WITH CHECK: dava para trocar o
--     contact_id para um contato fora do alcance (ou created_by para outro usuário).
--   * INSERT de public.whisper_messages só exigia sender_id = perfil do chamador, sem
--     olhar a visibilidade do contato.
--
-- Efeito: o enviador de agendadas (job AG2) roda com privilégio de serviço e nunca passa
-- por RLS. Sem esta correção, um agente agendava envio para contato fora do alcance dele e
-- o job entregaria. O mesmo valia para o sussurro a um contato que o agente não enxerga.
--
-- Reaproveita os MESMOS helpers já usados pelas policies de public.messages e pela RPC
-- enqueue_outbound_message (20260925120000 e 20260930200000):
--   is_contact_visible_to_user(contact_id, auth.uid()) -> contato atribuído ao chamador, ou
--       admin/supervisor (é exatamente a guarda de envio da RPC de fila);
--   user_has_permission(auth.uid(), 'send_messages')    -> a mesma permissão exigida no envio.
--
-- Aditiva: só DROP/CREATE das policies citadas. NÃO toca linhas existentes (nenhum DML),
-- não altera o SELECT nem o DELETE de scheduled_messages, nem a leitura de whisper_messages
-- (que continua restrita ao remetente, ao destinatário e a admin/supervisor).

-- scheduled_messages: INSERT exige created_by do próprio usuário E contato visível E
-- permissão de envio. admin/supervisor continuam passando (mesmo ramo dos helpers).
-- Tudo numa só transação: se qualquer CREATE POLICY falhar, nada fica aplicado.
BEGIN;

DROP POLICY IF EXISTS "Users can create scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      AND public.is_contact_visible_to_user(contact_id, auth.uid())
      AND public.user_has_permission(auth.uid(), 'send_messages')
    )
  );

-- scheduled_messages: UPDATE ganha WITH CHECK com a MESMA regra — o novo estado não pode
-- apontar para contato não visível nem para created_by de outro usuário. USING mantém
-- (dono da linha ou admin/supervisor), como estava.
DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      AND public.is_contact_visible_to_user(contact_id, auth.uid())
      AND public.user_has_permission(auth.uid(), 'send_messages')
    )
  );

-- whisper_messages: INSERT exige remetente = o próprio usuário E contato visível.
-- admin/supervisor continuam podendo (ramo dos helpers).
DROP POLICY IF EXISTS "Users can insert own whisper messages" ON public.whisper_messages;
CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      AND public.is_contact_visible_to_user(contact_id, auth.uid())
    )
  );

COMMIT;
