REVOKE EXECUTE ON FUNCTION public.dashboard_kpi(timestamp with time zone, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_contact_counts(timestamp with time zone, timestamp with time zone, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_hourly_volume(integer, uuid, uuid) FROM anon;
