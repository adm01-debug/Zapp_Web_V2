CREATE OR REPLACE FUNCTION public.dashboard_hourly_volume(p_days int DEFAULT 8)
RETURNS TABLE (day date, hour integer, message_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    count(*) AS message_count
  FROM public.messages
  WHERE created_at >= (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    - (make_interval(days => greatest(least(coalesce(p_days, 8), 31), 1) - 1))
  ) AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2;
$$;

COMMENT ON FUNCTION public.dashboard_hourly_volume(int) IS
  'Dashboard E22 (2026-09-25): agrega messages por (dia local America/Sao_Paulo, hora) '
  'para os ultimos p_days dias (default 8, clamp 1-31). SECURITY INVOKER — respeita RLS '
  'de messages. Substitui fetch cru de linhas no cliente (achado A6: cap silencioso de '
  '1000 linhas do PostgREST truncava a amostra em useTodayHourlyVolume).';

GRANT EXECUTE ON FUNCTION public.dashboard_hourly_volume(int) TO authenticated;
