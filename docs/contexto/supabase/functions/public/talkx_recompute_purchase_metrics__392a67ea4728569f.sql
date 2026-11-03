CREATE OR REPLACE FUNCTION public.talkx_recompute_purchase_metrics(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bands jsonb;
  v_recency integer[];
  v_frequency integer[];
  v_monetary numeric[];
  v_min_buyers integer;
  v_buyer_count integer;
  v_changed integer := 0;
BEGIN
  v_bands := COALESCE((SELECT value FROM public.talkx_settings WHERE key = 'rfm_bands'), '{}'::jsonb);

  v_recency := CASE WHEN jsonb_typeof(v_bands -> 'recency_days') = 'array'
    THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(v_bands -> 'recency_days') AS t(x))
    ELSE ARRAY[30, 90, 180, 365] END;
  IF array_length(v_recency, 1) IS DISTINCT FROM 4 THEN v_recency := ARRAY[30, 90, 180, 365]; END IF;

  v_frequency := CASE WHEN jsonb_typeof(v_bands -> 'frequency') = 'array'
    THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(v_bands -> 'frequency') AS t(x))
    ELSE ARRAY[1, 2, 4, 9] END;
  IF array_length(v_frequency, 1) IS DISTINCT FROM 4 THEN v_frequency := ARRAY[1, 2, 4, 9]; END IF;

  v_monetary := CASE WHEN jsonb_typeof(v_bands -> 'monetary') = 'array'
    THEN ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(v_bands -> 'monetary') AS t(x))
    ELSE ARRAY[100, 500, 1000, 5000] END;
  IF array_length(v_monetary, 1) IS DISTINCT FROM 4 THEN v_monetary := ARRAY[100, 500, 1000, 5000]; END IF;

  v_min_buyers := COALESCE(NULLIF(v_bands ->> 'monetary_min_buyers_for_quintiles', '')::integer, 100);

  WITH effective_purchases AS (
    SELECT p.contact_id,
           p.purchased_at,
           p.amount
    FROM public.contact_purchases AS p
    WHERE p.contact_id IS NOT NULL
      AND p.purchased_at IS NOT NULL
      AND COALESCE(p.status, '') IN ('approved', 'completed')
      AND COALESCE(p.purchase_type, 'purchase') IN ('purchase', 'subscription')
  ),
  buyers AS (
    SELECT p.contact_id,
           max(p.purchased_at) AS last_purchase_at,
           count(*)::integer AS orders_count,
           COALESCE(sum(COALESCE(p.amount, 0)), 0)::numeric(14,2) AS total_spent
    FROM effective_purchases AS p
    GROUP BY p.contact_id
  ),
  buyer_count AS (
    SELECT count(*)::integer AS n FROM buyers
  ),
  scored AS (
    SELECT b.contact_id,
           b.last_purchase_at,
           b.orders_count,
           b.total_spent,
           GREATEST(
             0,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date
               - (b.last_purchase_at AT TIME ZONE 'America/Sao_Paulo')::date
           )::integer AS recency_days,
           ntile(5) OVER (ORDER BY b.total_spent, b.contact_id) AS monetary_quintile
    FROM buyers AS b
  ),
  noted AS (
    SELECT s.contact_id,
           s.last_purchase_at,
           s.orders_count,
           s.total_spent,
           s.recency_days,
           CASE WHEN s.recency_days <= v_recency[1] THEN 5
                WHEN s.recency_days <= v_recency[2] THEN 4
                WHEN s.recency_days <= v_recency[3] THEN 3
                WHEN s.recency_days <= v_recency[4] THEN 2
                ELSE 1 END AS r_note,
           CASE WHEN s.orders_count <= v_frequency[1] THEN 1
                WHEN s.orders_count <= v_frequency[2] THEN 2
                WHEN s.orders_count <= v_frequency[3] THEN 3
                WHEN s.orders_count <= v_frequency[4] THEN 4
                ELSE 5 END AS f_note,
           CASE WHEN (SELECT n FROM buyer_count) >= v_min_buyers THEN s.monetary_quintile::integer
                WHEN s.total_spent <= v_monetary[1] THEN 1
                WHEN s.total_spent <= v_monetary[2] THEN 2
                WHEN s.total_spent <= v_monetary[3] THEN 3
                WHEN s.total_spent <= v_monetary[4] THEN 4
                ELSE 5 END AS m_note
    FROM scored AS s
  ),
  final AS (
    SELECT n.contact_id,
           n.last_purchase_at,
           n.orders_count,
           n.total_spent,
           round(n.total_spent / NULLIF(n.orders_count, 0), 2)::numeric(14,2) AS avg_ticket,
           n.recency_days,
           n.r_note,
           n.f_note,
           n.m_note,
           CASE
             WHEN n.r_note >= 4 AND n.f_note >= 4 AND n.m_note >= 4 THEN 'Campeões'
             WHEN n.r_note >= 3 AND n.f_note >= 3 AND n.m_note >= 3 THEN 'Leais'
             WHEN n.r_note >= 4 AND n.f_note = 1 THEN 'Novos'
             WHEN n.r_note >= 3 THEN 'Em potencial'
             WHEN n.f_note >= 3 THEN 'Em risco'
             WHEN n.f_note <= 2 AND n.m_note >= 3 THEN 'Hibernando'
             ELSE 'Perdidos'
           END AS segment
    FROM noted AS n
  ),
  upsert_candidates AS (
    SELECT 'upsert'::text AS change_kind,
           f.contact_id,
           f.last_purchase_at,
           f.orders_count,
           f.total_spent,
           f.avg_ticket,
           f.recency_days,
           f.f_note,
           f.m_note,
           f.segment,
           a.purchases_synced_at AS previous_synced_at
    FROM final AS f
    LEFT JOIN public.talkx_contact_attributes AS a ON a.contact_id = f.contact_id
    WHERE (a.last_purchase_at, a.orders_count, a.total_spent, a.avg_ticket,
           a.rfm_recency_days, a.rfm_frequency, a.rfm_monetary, a.rfm_segment)
          IS DISTINCT FROM
          (f.last_purchase_at, f.orders_count, f.total_spent, f.avg_ticket,
           f.recency_days, f.f_note, f.m_note, f.segment)
  ),
  reset_candidates AS (
    SELECT 'reset'::text AS change_kind,
           a.contact_id,
           NULL::timestamptz AS last_purchase_at,
           0::integer AS orders_count,
           0::numeric(14,2) AS total_spent,
           NULL::numeric(14,2) AS avg_ticket,
           NULL::integer AS recency_days,
           NULL::integer AS f_note,
           NULL::integer AS m_note,
           NULL::text AS segment,
           a.purchases_synced_at AS previous_synced_at
    FROM public.talkx_contact_attributes AS a
    WHERE NOT EXISTS (SELECT 1 FROM buyers AS b WHERE b.contact_id = a.contact_id)
      AND (a.last_purchase_at, a.orders_count, a.total_spent, a.avg_ticket,
           a.rfm_recency_days, a.rfm_frequency, a.rfm_monetary, a.rfm_segment)
          IS DISTINCT FROM
          (NULL::timestamptz, 0::integer, 0::numeric(14,2), NULL::numeric(14,2),
           NULL::integer, NULL::integer, NULL::integer, NULL::text)
  ),
  selected AS (
    SELECT * FROM upsert_candidates
    UNION ALL
    SELECT * FROM reset_candidates
    ORDER BY previous_synced_at ASC NULLS FIRST, contact_id, change_kind
    LIMIT GREATEST(COALESCE(p_limit, 0), 0)
  ),
  reseted AS (
    UPDATE public.talkx_contact_attributes AS a
    SET last_purchase_at = NULL,
        orders_count = 0,
        total_spent = 0,
        avg_ticket = NULL,
        rfm_recency_days = NULL,
        rfm_frequency = NULL,
        rfm_monetary = NULL,
        rfm_segment = NULL,
        purchases_synced_at = now(),
        updated_at = now()
    FROM selected AS s
    WHERE s.change_kind = 'reset'
      AND a.contact_id = s.contact_id
    RETURNING 1
  ),
  upserted AS (
    INSERT INTO public.talkx_contact_attributes AS a
      (contact_id, last_purchase_at, orders_count, total_spent, avg_ticket,
       rfm_recency_days, rfm_frequency, rfm_monetary, rfm_segment,
       purchases_synced_at, updated_at)
    SELECT s.contact_id,
           s.last_purchase_at,
           s.orders_count,
           s.total_spent,
           s.avg_ticket,
           s.recency_days,
           s.f_note,
           s.m_note,
           s.segment,
           now(),
           now()
    FROM selected AS s
    WHERE s.change_kind = 'upsert'
    ON CONFLICT (contact_id) DO UPDATE SET
      last_purchase_at = EXCLUDED.last_purchase_at,
      orders_count = EXCLUDED.orders_count,
      total_spent = EXCLUDED.total_spent,
      avg_ticket = EXCLUDED.avg_ticket,
      rfm_recency_days = EXCLUDED.rfm_recency_days,
      rfm_frequency = EXCLUDED.rfm_frequency,
      rfm_monetary = EXCLUDED.rfm_monetary,
      rfm_segment = EXCLUDED.rfm_segment,
      purchases_synced_at = EXCLUDED.purchases_synced_at,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT ((SELECT count(*) FROM upserted) + (SELECT count(*) FROM reseted))::integer
    INTO v_changed;

  RETURN v_changed;
END;
$function$
