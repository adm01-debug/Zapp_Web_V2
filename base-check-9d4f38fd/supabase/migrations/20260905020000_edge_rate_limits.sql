-- Rate limit persistente para Edge Functions. O checkRateLimit em memoria
-- (_shared/validation.ts) vive por isolate e zera a cada cold start: qualquer
-- cliente distribuindo requests entre isolates passava do limite (achado cubic
-- P1 no #218). Esta tabela + funcao atomica sao a fonte de verdade; a memoria
-- vira so pre-filtro. Sem policies: somente service_role (edges) acessa.
CREATE TABLE public.edge_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edge_rate_limits FROM anon, authenticated;

COMMENT ON TABLE public.edge_rate_limits IS 'Contadores de rate limit das Edge Functions (chave = funcao:ip|email|user). Fonte de verdade do enforceRateLimit em _shared/validation.ts. Linhas paradas ha 1 dia sao removidas pelo cron cleanup-edge-rate-limits.';

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.edge_rate_limits AS r (key, window_start, hits, updated_at)
  VALUES (p_key, now(), 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN 1
          ELSE r.hits + 1
        END,
        window_start = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN now()
          ELSE r.window_start
        END,
        updated_at = now()
  RETURNING r.hits INTO v_hits;

  RETURN QUERY SELECT v_hits <= p_max, GREATEST(p_max - v_hits, 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

SELECT cron.schedule('cleanup-edge-rate-limits', '15 4 * * *', $cron$DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 day'$cron$);
