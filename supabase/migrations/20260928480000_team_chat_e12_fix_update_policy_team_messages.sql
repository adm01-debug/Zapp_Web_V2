-- Objetivo: Unificar policy UPDATE em team_messages usando current_profile_id()
-- Estado ao vivo antes: múltiplas policies UPDATE conflitantes
-- Rollback: DROP POLICY team_messages_update_own ON public.team_messages

DROP POLICY IF EXISTS "team_messages_update" ON public.team_messages;
DROP POLICY IF EXISTS "Users can update own team messages" ON public.team_messages;
DROP POLICY IF EXISTS "team_messages_update_own" ON public.team_messages;
CREATE POLICY "team_messages_update_own" ON public.team_messages
  FOR UPDATE TO authenticated
  USING (sender_id = current_profile_id())
  WITH CHECK (sender_id = current_profile_id());
