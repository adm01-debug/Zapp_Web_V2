CREATE OR REPLACE FUNCTION public.validate_talkx_send_weekdays(p_weekdays jsonb, p_error text)
 RETURNS smallint[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_out smallint[] := '{}';
  v_elem text;
  v_day integer;
BEGIN
  IF p_weekdays IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_weekdays) <> 'array' THEN
    RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
  END IF;
  -- teto por chamada: nunca há mais de 7 dias válidos (0..6).
  IF jsonb_array_length(p_weekdays) > 32 THEN
    RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements_text(p_weekdays)
  LOOP
    BEGIN
      v_day := v_elem::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
    END;
    IF v_day IS NULL OR v_day < 0 OR v_day > 6 THEN
      RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
    END IF;
    IF NOT (v_day::smallint = ANY(v_out)) THEN
      v_out := v_out || v_day::smallint;
    END IF;
  END LOOP;
  IF v_out = '{}' THEN
    RETURN NULL;
  END IF;
  RETURN v_out;
END;
$function$
