CREATE OR REPLACE FUNCTION public.talkx_segment_library_month(p_month_start date, p_timezone text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS TABLE(total_segments integer, active_segments integer, crm360_segments integer, deliveries integer, conversions integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tz   text        := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_month_start IS NULL THEN
    RAISE EXCEPTION 'talkx_segment_library_month: p_month_start e obrigatorio' USING ERRCODE = '22004';
  END IF;

  -- Inicio e fim do mes no fuso pedido (fuso invalido estoura, nao chuta).
  v_from := (p_month_start::timestamp AT TIME ZONE v_tz);
  v_to   := ((p_month_start + interval '1 month')::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH camp AS (
    -- Campanhas COM SEGMENTO que iniciaram envio na janela (rascunho fora:
    -- started_at nulo). Vale o segmento unico (segment_id) e a lista de X057.
    SELECT c.id
    FROM public.talkx_campaigns AS c
    WHERE c.started_at IS NOT NULL
      AND c.started_at >= v_from
      AND c.started_at <  v_to
      AND (
        c.segment_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.talkx_campaign_segments AS cs
          WHERE cs.campaign_id = c.id
        )
      )
  )
  SELECT
    -- estoque no fim do mes (no mes corrente, v_to esta no futuro = tudo o que existe)
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE s.created_at < v_to)::integer,
    -- uso real no mes
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE EXISTS (
              SELECT 1 FROM public.talkx_campaigns AS c
              WHERE c.segment_id = s.id
                AND c.started_at IS NOT NULL
                AND c.started_at >= v_from
                AND c.started_at <  v_to
            )
         OR EXISTS (
              SELECT 1 FROM public.talkx_campaign_segments AS cs
                JOIN public.talkx_campaigns AS c2 ON c2.id = cs.campaign_id
              WHERE cs.segment_id = s.id
                AND c2.started_at IS NOT NULL
                AND c2.started_at >= v_from
                AND c2.started_at <  v_to
            ))::integer,
    (SELECT count(*) FROM public.talkx_segments AS s
      WHERE s.origin = 'crm360'
        AND s.created_at < v_to)::integer,
    (SELECT count(*) FROM public.talkx_recipients AS r
       JOIN camp ON camp.id = r.campaign_id
      WHERE r.delivered_at >= v_from
        AND r.delivered_at <  v_to)::integer,
    (SELECT count(*) FROM public.talkx_conversions AS cv
       JOIN camp ON camp.id = cv.campaign_id
      WHERE coalesce(cv.occurred_at, cv.created_at) >= v_from
        AND coalesce(cv.occurred_at, cv.created_at) <  v_to)::integer;
END;
$function$
