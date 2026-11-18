-- FIX-S03-006: Policies UPDATE/ALL sem WITH CHECK — profile_id alteravel
-- Problema: Policies com USING (profile_id = auth.uid()) sem WITH CHECK equivalente
--           permitem que um UPDATE altere profile_id para outro usuario.
-- Tabelas afetadas: reminders, catalog_favorites, copilot_insights, copilot_sessions
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

BEGIN;

-- 1. reminders
ALTER POLICY "Users can manage own reminders" ON public.reminders
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- 2. catalog_favorites
ALTER POLICY "Users can manage own catalog favorites" ON public.catalog_favorites
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. copilot_insights (vendor_own_insights)
ALTER POLICY vendor_own_insights ON public.copilot_insights
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- 4. copilot_sessions (vendor_own_sessions)
ALTER POLICY vendor_own_sessions ON public.copilot_sessions
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Verificacao:
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('reminders','catalog_favorites','copilot_insights','copilot_sessions')
  AND cmd IN ('ALL','UPDATE')
ORDER BY tablename;

COMMIT;

-- RISCO DE REGRESSAO: BAIXO
