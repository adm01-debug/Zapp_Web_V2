-- scope snoozes/pins/favorites policies to authenticated role only
-- Rollback: drop policies with TO authenticated; recreate originals without TO (all roles):
--   DROP POLICY IF EXISTS "Users can create own snoozes" ON public.conversation_snoozes;
--   DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorite_contacts;
--   DROP POLICY IF EXISTS "Users can create own favorites" ON public.favorite_contacts;
--   DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorite_contacts;
--   DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorite_contacts;
--   DROP POLICY IF EXISTS "Users can view own pins" ON public.pinned_conversations;
--   DROP POLICY IF EXISTS "Users can create own pins" ON public.pinned_conversations;
--   DROP POLICY IF EXISTS "Users can update own pins" ON public.pinned_conversations;
--   DROP POLICY IF EXISTS "Users can delete own pins" ON public.pinned_conversations;
--   CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT WITH CHECK (snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id));
--   CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT USING (user_id = auth.uid());
--   CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id));
--   CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--   CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE USING (user_id = auth.uid());
--   CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
--   CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id));
--   CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())) WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
--   CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create own snoozes" ON public.conversation_snoozes;
  DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorite_contacts;
  DROP POLICY IF EXISTS "Users can create own favorites" ON public.favorite_contacts;
  DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorite_contacts;
  DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorite_contacts;
  DROP POLICY IF EXISTS "Users can view own pins" ON public.pinned_conversations;
  DROP POLICY IF EXISTS "Users can create own pins" ON public.pinned_conversations;
  DROP POLICY IF EXISTS "Users can update own pins" ON public.pinned_conversations;
  DROP POLICY IF EXISTS "Users can delete own pins" ON public.pinned_conversations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users can create own snoozes"
  ON public.conversation_snoozes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id)
  );

CREATE POLICY "Users can view own favorites"
  ON public.favorite_contacts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own favorites"
  ON public.favorite_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id)
  );

CREATE POLICY "Users can update own favorites"
  ON public.favorite_contacts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites"
  ON public.favorite_contacts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own pins"
  ON public.pinned_conversations
  FOR SELECT
  TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create own pins"
  ON public.pinned_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id)
  );

CREATE POLICY "Users can update own pins"
  ON public.pinned_conversations
  FOR UPDATE
  TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can delete own pins"
  ON public.pinned_conversations
  FOR DELETE
  TO authenticated
  USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));