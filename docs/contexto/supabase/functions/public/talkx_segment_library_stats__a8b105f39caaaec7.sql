CREATE OR REPLACE FUNCTION public.talkx_segment_library_stats(p_timezone text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Base minima de entregues para a conversao media existir. Abaixo dela a
  -- resposta vem SEM numero (has_data = false e value_pct = null), nunca com
  -- um percentual inventado.
  c_min_deliveries constant integer := 100;

  v_tz          text := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_month       date;
  v_previous    date;
  v_cur         record;
  v_prev        record;
  v_has_current boolean;
  v_has_prev    boolean;
  v_value       numeric;
  v_value_prev  numeric;
  v_series      jsonb;
BEGIN
  v_month    := date_trunc('month', (now() AT TIME ZONE v_tz)::timestamp)::date;
  v_previous := (v_month - interval '1 month')::date;

  SELECT * INTO v_cur  FROM public.talkx_segment_library_month(v_month, v_tz);
  SELECT * INTO v_prev FROM public.talkx_segment_library_month(v_previous, v_tz);

  v_has_current := v_cur.deliveries >= c_min_deliveries;
  v_has_prev    := v_prev.deliveries >= c_min_deliveries;

  IF v_has_current THEN
    v_value := round(v_cur.conversions::numeric / v_cur.deliveries * 100, 1);
  END IF;
  IF v_has_prev THEN
    v_value_prev := round(v_prev.conversions::numeric / v_prev.deliveries * 100, 1);
  END IF;

  -- Serie de 8 meses (do mais antigo ao corrente). Cada ponto e o ULTIMO retrato
  -- gravado para o mes no historico; mes sem retrato vem com has_data = false e
  -- os numeros nulos ("sem dados ainda" na tela), nunca zeros disfarcados.
  WITH months AS (
    SELECT (v_month - make_interval(months => g))::date AS month_start
    FROM generate_series(7, 0, -1) AS g
  ),
  pontos AS (
    SELECT m.month_start,
           h.total_segments, h.active_segments, h.crm360_segments,
           h.deliveries, h.conversions
    FROM months AS m
    LEFT JOIN LATERAL (
      SELECT hh.total_segments, hh.active_segments, hh.crm360_segments,
             hh.deliveries, hh.conversions
      FROM public.talkx_segment_library_history AS hh
      WHERE hh.counted_on >= m.month_start
        AND hh.counted_on <  (m.month_start + interval '1 month')::date
      ORDER BY hh.counted_on DESC
      LIMIT 1
    ) AS h ON TRUE
    ORDER BY m.month_start
  )
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'month',           p.month_start,
               'has_data',        p.total_segments IS NOT NULL,
               'total_segments',  p.total_segments,
               'active_segments', p.active_segments,
               'crm360_segments', p.crm360_segments,
               'deliveries',      p.deliveries,
               'conversions',     p.conversions,
               'conversion_pct',  CASE
                                    WHEN p.deliveries IS NOT NULL
                                     AND p.deliveries >= c_min_deliveries
                                    THEN round(p.conversions::numeric / p.deliveries * 100, 1)
                                  END
             ) ORDER BY p.month_start
           ),
           '[]'::jsonb
         )
    INTO v_series
    FROM pontos AS p;

  RETURN jsonb_build_object(
    'generated_at',          now(),
    'timezone',              v_tz,
    'month_start',           v_month,
    'total_segments',        v_cur.total_segments,
    'active_this_month',     v_cur.active_segments,
    'active_previous_month', v_prev.active_segments,
    'active_delta',          v_cur.active_segments - v_prev.active_segments,
    'crm360_connected',      v_cur.crm360_segments,
    'crm360_previous_month', v_prev.crm360_segments,
    'crm360_delta',          v_cur.crm360_segments - v_prev.crm360_segments,
    'conversion', jsonb_build_object(
      'value_pct',            v_value,
      'previous_pct',         v_value_prev,
      'delta_pp',             CASE
                                WHEN v_value IS NOT NULL AND v_value_prev IS NOT NULL
                                THEN round(v_value - v_value_prev, 1)
                              END,
      'has_data',             v_has_current,
      'deliveries',           v_cur.deliveries,
      'conversions',          v_cur.conversions,
      'previous_deliveries',  v_prev.deliveries,
      'previous_conversions', v_prev.conversions,
      'min_deliveries',       c_min_deliveries
    ),
    'series', v_series
  );
END;
$function$
