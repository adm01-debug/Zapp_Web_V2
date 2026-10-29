-- connection_alert_preferences: policy DELETE para authenticated
-- Rollback:
--   DROP POLICY IF EXISTS connection_alert_preferences_delete_own
--     ON public.connection_alert_preferences;
--
-- A migration original (20261013044440) omitiu DELETE de proposito
-- ("preferencia nao se apaga, se desliga"). Esta migration complementa
-- para o caso de a UI oferecer "resetar para os padroes": o usuario
-- apaga a propria linha e o hook, ao ler novamente, recria com upsert
-- usando todos os defaults (push_enabled=true, email_enabled=true, etc.).
-- O DELETE so afeta a propria linha (USING user_id = auth.uid()).

CREATE POLICY connection_alert_preferences_delete_own
  ON public.connection_alert_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
