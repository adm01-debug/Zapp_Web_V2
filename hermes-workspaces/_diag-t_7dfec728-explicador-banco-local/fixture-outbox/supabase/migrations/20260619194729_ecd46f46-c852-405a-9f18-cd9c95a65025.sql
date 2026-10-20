
CREATE TABLE public.link_preview_cache_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_count INTEGER NOT NULL DEFAULT 0,
  remaining_count INTEGER NOT NULL DEFAULT 0,
  table_size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT ON public.link_preview_cache_metrics TO authenticated;
GRANT ALL ON public.link_preview_cache_metrics TO service_role;

ALTER TABLE public.link_preview_cache_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/supervisors can read metrics"
ON public.link_preview_cache_metrics
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE INDEX idx_lpc_metrics_ran_at ON public.link_preview_cache_metrics (ran_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_link_preview_cache()
RETURNS TABLE(deleted_count INTEGER, remaining_count INTEGER, table_size_bytes BIGINT, duration_ms INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_deleted INTEGER := 0;
  v_remaining INTEGER := 0;
  v_size BIGINT := 0;
  v_duration INTEGER := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.link_preview_cache
    WHERE expires_at < now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM d;

  SELECT COUNT(*) INTO v_remaining FROM public.link_preview_cache;
  SELECT pg_total_relation_size('public.link_preview_cache') INTO v_size;
  v_duration := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::INTEGER;

  INSERT INTO public.link_preview_cache_metrics
    (deleted_count, remaining_count, table_size_bytes, duration_ms)
  VALUES
    (v_deleted, v_remaining, v_size, v_duration);

  RETURN QUERY SELECT v_deleted, v_remaining, v_size, v_duration;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_link_preview_cache() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_link_preview_cache() TO service_role;
