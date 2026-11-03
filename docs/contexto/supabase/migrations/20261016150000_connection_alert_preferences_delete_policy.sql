CREATE POLICY connection_alert_preferences_delete_own ON public.connection_alert_preferences FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
