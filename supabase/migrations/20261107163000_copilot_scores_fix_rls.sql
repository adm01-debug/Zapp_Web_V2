SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "copilot_conversation_scores_select" ON public.copilot_conversation_scores;
CREATE POLICY "copilot_conversation_scores_select"
ON public.copilot_conversation_scores FOR SELECT TO authenticated
USING (
  session_id IN (
    SELECT id FROM public.copilot_sessions
    WHERE profile_id IN (
      SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "copilot_learning_moments_select" ON public.copilot_learning_moments;
CREATE POLICY "copilot_learning_moments_select"
ON public.copilot_learning_moments FOR SELECT TO authenticated
USING (
  session_id IN (
    SELECT id FROM public.copilot_sessions
    WHERE profile_id IN (
      SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  )
);
