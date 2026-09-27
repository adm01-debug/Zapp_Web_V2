-- Hardening: remove EXECUTE de PUBLIC nas RPCs de agregação do Dashboard.
-- Complementa 20260926100134_dashboard_revoke_anon_execute_rpcs.sql: além de
-- anon, o grant implícito de PUBLIC também precisa ser removido para que
-- somente authenticated e service_role possam chamar essas RPCs.
REVOKE EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_contact_counts(timestamp with time zone, timestamp with time zone, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_hourly_volume(integer, uuid, uuid) FROM PUBLIC;
