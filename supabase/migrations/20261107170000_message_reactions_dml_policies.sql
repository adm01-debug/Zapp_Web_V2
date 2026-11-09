SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_insert_policy"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id IN (
    SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
  )
  AND message_id IN (
    SELECT m.id FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.id IN (
      SELECT conversation_id FROM public.conversation_participants
      WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_update_policy"
ON public.message_reactions FOR UPDATE TO authenticated
USING (
  user_id IN (
    SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  user_id IN (
    SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_delete_policy"
ON public.message_reactions FOR DELETE TO authenticated
USING (
  user_id IN (
    SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
  )
);
