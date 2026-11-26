CREATE OR REPLACE FUNCTION public.recalcular_retencao_copiloto(p_dias integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dia   date;
  v_dias  integer := least(greatest(coalesce(p_dias, 7), 1), 90);
  v_total integer := 0;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente admin ou supervisor pode recalcular a retencao do copiloto'
      USING ERRCODE = '42501';
  END IF;

  FOR v_dia IN SELECT generate_series(current_date - v_dias, current_date, interval '1 day')::date LOOP
    PERFORM public.run_copilot_retention(v_dia);
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$
