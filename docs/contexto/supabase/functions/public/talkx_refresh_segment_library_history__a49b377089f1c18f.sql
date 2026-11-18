CREATE OR REPLACE FUNCTION public.talkx_refresh_segment_library_history(p_months integer DEFAULT 8, p_timezone text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tz    text    := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo');
  v_today date    := (now() AT TIME ZONE v_tz)::date;
  v_month date    := date_trunc('month', v_today::timestamp)::date;
  v_start date;
  v_end   date;
  v_day   date;
  v_row   record;
  v_saved integer := 0;
  i       integer;
BEGIN
  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'talkx_refresh_segment_library_history: p_months precisa estar entre 1 e 36'
      USING ERRCODE = '22023';
  END IF;

  -- Do mes mais antigo para o corrente. A chave e o dia: o mes fechado ganha o
  -- proprio ultimo dia e o mes corrente ganha hoje — rodar duas vezes no mesmo
  -- dia ATUALIZA a mesma linha (idempotente), nunca duplica.
  FOR i IN REVERSE (p_months - 1) .. 0 LOOP
    v_start := (v_month - make_interval(months => i))::date;
    v_end   := (v_start + interval '1 month')::date;
    v_day   := least(v_end - 1, v_today);

    SELECT * INTO v_row
    FROM public.talkx_segment_library_month(v_start, v_tz);

    INSERT INTO public.talkx_segment_library_history
      (counted_on, total_segments, active_segments, crm360_segments,
       deliveries, conversions, captured_at)
    VALUES
      (v_day, v_row.total_segments, v_row.active_segments, v_row.crm360_segments,
       v_row.deliveries, v_row.conversions, now())
    ON CONFLICT (counted_on) DO UPDATE
      SET total_segments  = excluded.total_segments,
          active_segments = excluded.active_segments,
          crm360_segments = excluded.crm360_segments,
          deliveries      = excluded.deliveries,
          conversions     = excluded.conversions,
          captured_at     = excluded.captured_at;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN v_saved;
END;
$function$
