-- FK indexes missing on 6 foreign key columns (performance: avoids seq scans on JOINs)
CREATE INDEX idx_security_alerts_resolved_by ON public.security_alerts(resolved_by);
CREATE INDEX idx_geo_blocking_settings_updated_by ON public.geo_blocking_settings(updated_by);
CREATE INDEX idx_auto_close_config_updated_by ON public.auto_close_config(updated_by);
CREATE INDEX idx_warroom_alerts_dismissed_by ON public.warroom_alerts(dismissed_by);
CREATE INDEX idx_connection_health_logs_connection_id ON public.connection_health_logs(connection_id);
CREATE INDEX idx_ai_providers_created_by ON public.ai_providers(created_by);
