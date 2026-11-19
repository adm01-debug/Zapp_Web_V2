CREATE OR REPLACE FUNCTION public.talkx_assign_variant(p_contact_id uuid, p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bucket integer;
  v_variant_id uuid;
BEGIN
  v_bucket := (hashtext(p_contact_id::text)::bigint & 2147483647) % 100;

  SELECT id INTO v_variant_id
  FROM (
    SELECT id,
           SUM(weight) OVER (ORDER BY label ROWS UNBOUNDED PRECEDING) AS cumulative
    FROM public.talkx_template_variants
    WHERE template_id = p_template_id
  ) ordered
  WHERE v_bucket < cumulative
  ORDER BY cumulative
  LIMIT 1;

  IF v_variant_id IS NULL THEN
    RAISE EXCEPTION 'talkx_assign_variant: template % has no variant covering bucket % (weights must sum to 100)', p_template_id, v_bucket
      USING errcode = '22023';
  END IF;

  RETURN v_variant_id;
END;
$function$
