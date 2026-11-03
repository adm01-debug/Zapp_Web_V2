CREATE OR REPLACE FUNCTION public.contacts_stats_series(p_include_legacy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE
  v_visible uuid[];
  v_profile uuid;
  v_admin boolean;
  v_out jsonb;
BEGIN
  v_admin := COALESCE(auth.role() = 'service_role', false)
             OR public.is_admin_or_supervisor(auth.uid());
  v_visible := (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v);
  v_profile := (SELECT public.get_profile_id_for_user(auth.uid()));

  WITH base AS (
    SELECT c.company, c.contact_type, now() - c.created_at AS age
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (COALESCE(p_include_legacy, false)
           OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_visible, v_profile, v_admin)
  ),
  empr AS (
    SELECT count(DISTINCT lower(btrim(company)))::integer AS n
    FROM base WHERE NULLIF(btrim(company), '') IS NOT NULL
  ),
  buckets AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.age >= (CASE WHEN i < 6 THEN (26 - i * 4) ELSE 0 END) * interval '1 day'
          AND b.age <  (CASE WHEN i < 6 THEN (30 - i * 4) ELSE 6 END) * interval '1 day') AS n
    FROM generate_series(0, 6) i
  ),
  total_cum AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.age >= (11 - i) * 7 * interval '1 day') AS n
    FROM generate_series(0, 11) i
  ),
  emp_cum AS (
    SELECT i,
      (SELECT count(DISTINCT lower(btrim(b.company)))::integer FROM base b
        WHERE b.age >= (11 - i) * 7 * interval '1 day'
          AND NULLIF(btrim(b.company), '') IS NOT NULL) AS n
    FROM generate_series(0, 11) i
  ),
  forn_cum AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.contact_type = 'fornecedor'
          AND b.age >= (11 - i) * 7 * interval '1 day'
          AND b.age <  (12 - i) * 7 * interval '1 day') AS n
    FROM generate_series(0, 11) i
  )
  SELECT jsonb_build_object(
    'empresas_distinct',              empr.n,
    'series_novos_daily_30',          (SELECT jsonb_agg(b.n ORDER BY b.i) FROM buckets b),
    'series_total_cumulative_12w',    (SELECT jsonb_agg(t.n ORDER BY t.i) FROM total_cum t),
    'series_empresas_cumulative_12w', (SELECT jsonb_agg(e.n ORDER BY e.i) FROM emp_cum e),
    'series_fornecedores_weekly_12',  (SELECT jsonb_agg(f.n ORDER BY f.i) FROM forn_cum f)
  )
  INTO v_out
  FROM empr;

  RETURN v_out;
END;
$function$
