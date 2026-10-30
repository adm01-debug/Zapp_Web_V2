-- scope_snoozes_pins_favorites_policies_to_authenticated
-- Rollback: volta as 9 policies ao corpo da 20260924230500 (sem TO = public).
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Users can create own snoozes" ON public.conversation_snoozes;
--   CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT WITH CHECK (snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id));
--   DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorite_contacts;
--   CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT USING (user_id = auth.uid());
--   DROP POLICY IF EXISTS "Users can create own favorites" ON public.favorite_contacts;
--   CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id));
--   DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorite_contacts;
--   CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--   DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorite_contacts;
--   CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE USING (user_id = auth.uid());
--   DROP POLICY IF EXISTS "Users can view own pins" ON public.pinned_conversations;
--   CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
--   DROP POLICY IF EXISTS "Users can create own pins" ON public.pinned_conversations;
--   CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id));
--   DROP POLICY IF EXISTS "Users can update own pins" ON public.pinned_conversations;
--   CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())) WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
--   DROP POLICY IF EXISTS "Users can delete own pins" ON public.pinned_conversations;
--   CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
--
-- N-141 (P3; SEC-RLS_CONTATOS_MENSAGENS-07): as 9 policies criadas pela
-- 20260924230500_fix_contact_id_idor_snoozes_pins_favorites.sql nao tem
-- clausula TO (vale para PUBLIC): visitante sem login (anon) e avaliado
-- pelas mesmas regras do dono. Como todo qual exige auth.uid(), hoje nao
-- da para explorar, mas um anon apresentando claims forjados do dono passa
-- no USING/WITH CHECK. Fix: recriar as 9 com TO authenticated, com o corpo
-- (USING/WITH CHECK, inclusive o EXISTS de visibilidade do contato do
-- IDOR) byte-identico ao da origem. Sem DO/EXCEPTION: DROP direto para
-- nenhum erro ser engolido. Nao toca nas policies de SELECT/DELETE de
-- snoozes da 20260409 (ja TO authenticated).

DROP POLICY IF EXISTS "Users can create own snoozes" ON public.conversation_snoozes;

CREATE POLICY "Users can create own snoozes"
  ON public.conversation_snoozes
  FOR INSERT TO authenticated
  WITH CHECK (
    snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id)
  );

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorite_contacts;

CREATE POLICY "Users can view own favorites"
  ON public.favorite_contacts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own favorites" ON public.favorite_contacts;

CREATE POLICY "Users can create own favorites"
  ON public.favorite_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id)
  );

DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorite_contacts;

CREATE POLICY "Users can update own favorites"
  ON public.favorite_contacts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorite_contacts;

CREATE POLICY "Users can delete own favorites"
  ON public.favorite_contacts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own pins" ON public.pinned_conversations;

CREATE POLICY "Users can view own pins"
  ON public.pinned_conversations
  FOR SELECT TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create own pins" ON public.pinned_conversations;

CREATE POLICY "Users can create own pins"
  ON public.pinned_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id)
  );

DROP POLICY IF EXISTS "Users can update own pins" ON public.pinned_conversations;

CREATE POLICY "Users can update own pins"
  ON public.pinned_conversations
  FOR UPDATE TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own pins" ON public.pinned_conversations;

CREATE POLICY "Users can delete own pins"
  ON public.pinned_conversations
  FOR DELETE TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
