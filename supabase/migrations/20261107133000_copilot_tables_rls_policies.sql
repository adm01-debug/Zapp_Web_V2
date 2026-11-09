SET search_path = public, pg_temp;

-- copilot_help_requests
DROP POLICY IF EXISTS "copilot_help_requests_select" ON public.copilot_help_requests;
CREATE POLICY "copilot_help_requests_select"
ON public.copilot_help_requests FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_help_requests_insert" ON public.copilot_help_requests;
CREATE POLICY "copilot_help_requests_insert"
ON public.copilot_help_requests FOR INSERT TO authenticated
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_outcomes
DROP POLICY IF EXISTS "copilot_outcomes_select" ON public.copilot_outcomes;
CREATE POLICY "copilot_outcomes_select"
ON public.copilot_outcomes FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_seller_settings
DROP POLICY IF EXISTS "copilot_seller_settings_select" ON public.copilot_seller_settings;
CREATE POLICY "copilot_seller_settings_select"
ON public.copilot_seller_settings FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_seller_settings_insert" ON public.copilot_seller_settings;
CREATE POLICY "copilot_seller_settings_insert"
ON public.copilot_seller_settings FOR INSERT TO authenticated
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_seller_settings_update" ON public.copilot_seller_settings;
CREATE POLICY "copilot_seller_settings_update"
ON public.copilot_seller_settings FOR UPDATE TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
))
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_usage
DROP POLICY IF EXISTS "copilot_usage_select" ON public.copilot_usage;
CREATE POLICY "copilot_usage_select"
ON public.copilot_usage FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_conversation_scores
DROP POLICY IF EXISTS "copilot_conversation_scores_select" ON public.copilot_conversation_scores;
CREATE POLICY "copilot_conversation_scores_select"
ON public.copilot_conversation_scores FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_conversation_scores_insert" ON public.copilot_conversation_scores;
CREATE POLICY "copilot_conversation_scores_insert"
ON public.copilot_conversation_scores FOR INSERT TO authenticated
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_conversation_scores_update" ON public.copilot_conversation_scores;
CREATE POLICY "copilot_conversation_scores_update"
ON public.copilot_conversation_scores FOR UPDATE TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
))
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_learning_moments
DROP POLICY IF EXISTS "copilot_learning_moments_select" ON public.copilot_learning_moments;
CREATE POLICY "copilot_learning_moments_select"
ON public.copilot_learning_moments FOR SELECT TO authenticated
USING (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS "copilot_learning_moments_insert" ON public.copilot_learning_moments;
CREATE POLICY "copilot_learning_moments_insert"
ON public.copilot_learning_moments FOR INSERT TO authenticated
WITH CHECK (profile_id IN (
  SELECT id FROM public.profiles WHERE user_id = (SELECT auth.uid())
));

-- copilot_objection_catalog (insert only para authenticated)
DROP POLICY IF EXISTS "copilot_objection_catalog_insert" ON public.copilot_objection_catalog;
CREATE POLICY "copilot_objection_catalog_insert"
ON public.copilot_objection_catalog FOR INSERT TO authenticated
WITH CHECK (true);
