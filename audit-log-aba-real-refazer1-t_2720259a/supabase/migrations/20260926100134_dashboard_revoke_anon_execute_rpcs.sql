-- Hardening: remove EXECUTE de anon nas RPCs de agregação do Dashboard.
-- Achado de auditoria (2026-09-26): dashboard_kpi, dashboard_contact_counts e
-- dashboard_hourly_volume tinham EXECUTE concedido a anon além de
-- authenticated/service_role, mais permissivo do que o necessário.
-- Somente authenticated e service_role devem poder chamar essas RPCs.
REVOKE EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_contact_counts(timestamp with time zone, timestamp with time zone, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_hourly_volume(integer, uuid, uuid) FROM anon;
