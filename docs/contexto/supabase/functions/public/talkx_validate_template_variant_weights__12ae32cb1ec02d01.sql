CREATE OR REPLACE FUNCTION public.talkx_validate_template_variant_weights()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template_id uuid;
  v_sum integer;
  v_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_template_id := OLD.template_id;
  ELSE
    v_template_id := NEW.template_id;
  END IF;

  SELECT COALESCE(SUM(weight), 0), COUNT(*) INTO v_sum, v_count
  FROM public.talkx_template_variants
  WHERE template_id = v_template_id;

  -- Template sem variantes restantes (todas apagadas) e aceito.
  IF v_count > 0 AND v_sum <> 100 THEN
    RAISE EXCEPTION 'Variant weights for template % sum to %, expected 100', v_template_id, v_sum
      USING errcode = '22023';
  END IF;

  -- Troca de template_id: o template antigo precisa continuar somando 100.
  IF TG_OP = 'UPDATE' AND OLD.template_id IS DISTINCT FROM NEW.template_id THEN
    SELECT COALESCE(SUM(weight), 0), COUNT(*) INTO v_sum, v_count
    FROM public.talkx_template_variants
    WHERE template_id = OLD.template_id;

    IF v_count > 0 AND v_sum <> 100 THEN
      RAISE EXCEPTION 'Variant weights for template % sum to %, expected 100', OLD.template_id, v_sum
        USING errcode = '22023';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
