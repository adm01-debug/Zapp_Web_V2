DROP POLICY IF EXISTS copilot_conversation_scores_select ON copilot_conversation_scores

CREATE POLICY copilot_conversation_scores_select ON copilot_conversation_scores FOR SELECT TO authenticated USING (scored_by = auth.uid() OR conversation_id IN (SELECT conversation_id FROM copilot_sessions WHERE profile_id = auth.uid()))

DROP POLICY IF EXISTS copilot_learning_moments_select ON copilot_learning_moments

CREATE POLICY copilot_learning_moments_select ON copilot_learning_moments FOR SELECT TO authenticated USING (tagged_by = auth.uid() OR conversation_id IN (SELECT conversation_id FROM copilot_sessions WHERE profile_id = auth.uid()))
