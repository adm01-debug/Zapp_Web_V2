CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience(p_campaign_id uuid, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_rules jsonb := '{"groups":[]}'::jsonb;
  v_contact_ids uuid[] := NULL;
  v_respect boolean;
  v_seg_list uuid[] := ARRAY[]::uuid[];
  v_rule_list jsonb[] := ARRAY[]::jsonb[];
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_skipped_invalid bigint := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_seg_by_id uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: gerar destinatarios e ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
  END IF;
  -- Revisao otimista: o snapshot so vale para a revisao que acabou de ser salva.
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- X057b: a lista de regras, uma por segmento, na ORDEM de position.
  IF v_campaign.audience_source = 'segment' THEN
    SELECT COALESCE(array_agg(src.segment_id ORDER BY src.position), ARRAY[]::uuid[]),
           COALESCE(array_agg(src.rules ORDER BY src.position), ARRAY[]::jsonb[])
      INTO v_seg_list, v_rule_list
      FROM (
        SELECT cs.position,
               cs.segment_id,
               CASE WHEN jsonb_typeof(segment.rules) = 'object'
                    THEN segment.rules ELSE '{"groups":[]}'::jsonb END AS rules
          FROM public.talkx_campaign_segments AS cs
          LEFT JOIN public.talkx_segments AS segment ON segment.id = cs.segment_id
         WHERE cs.campaign_id = v_campaign.id
        UNION ALL
        -- Compatibilidade: campanha de segmento unico ainda sem linhas na tabela
        -- nova (position 0, logo a primeira) resolve pela coluna segment_id.
        SELECT 0 AS position,
               v_campaign.segment_id,
               COALESCE((SELECT CASE WHEN jsonb_typeof(segundo.rules) = 'object'
                                     THEN segundo.rules ELSE '{"groups":[]}'::jsonb END
                           FROM public.talkx_segments AS segundo
                          WHERE segundo.id = v_campaign.segment_id), '{"groups":[]}'::jsonb) AS rules
         WHERE v_campaign.segment_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_campaign_segments AS existente
              WHERE existente.campaign_id = v_campaign.id
           )
      ) AS src;
  END IF;

  IF cardinality(v_seg_list) = 0 THEN
    -- Origem contacts/crm360 (ou campanha de segmento sem nenhum segmento): regras
    -- do proprio rascunho mais a selecao manual do passo 1 (X017).
    v_rules := COALESCE(v_campaign.audience_filters, '{}'::jsonb);
    IF jsonb_typeof(v_rules) <> 'object' THEN
      v_rules := '{}'::jsonb;
    END IF;
    IF jsonb_typeof(v_campaign.audience_filters -> 'contact_ids') = 'array' THEN
      BEGIN
        SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
          INTO v_contact_ids
          FROM jsonb_array_elements_text(v_campaign.audience_filters -> 'contact_ids') AS requested(value);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
      END;
    END IF;
    v_seg_list := ARRAY[NULL::uuid];
    v_rule_list := ARRAY[v_rules];
  END IF;

  v_respect := COALESCE(v_campaign.respect_suppression, true);

  -- X057b: uma avaliacao do motor (X016) POR segmento; cada contato fica com o
  -- PRIMEIRO segmento (menor position) que o contem, sem repetir contato.
  WITH seg AS (
    SELECT lista.ord AS position, lista.seg_id AS segment_id, lista.rules
      FROM unnest(v_seg_list, v_rule_list) WITH ORDINALITY AS lista(seg_id, rules, ord)
  ),
  base AS (
    SELECT seg.position,
           seg.segment_id,
           q.id,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed) AS eligible,
           (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) AS suppressed,
           (q.legacy_or_deleted OR q.invalid_phone) AS skipped_invalid
      FROM seg
      JOIN LATERAL public.talkx_audience_query(seg.rules, v_contact_ids, v_respect) AS q ON true
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (PARTITION BY b.id ORDER BY b.position) AS rn
      FROM base AS b
  )
  SELECT count(DISTINCT ranked.id) FILTER (WHERE ranked.eligible),
         count(DISTINCT ranked.id) FILTER (WHERE ranked.suppressed),
         count(DISTINCT ranked.id) FILTER (WHERE ranked.skipped_invalid),
         COALESCE(array_agg(ranked.id ORDER BY ranked.position, ranked.id) FILTER (WHERE ranked.eligible AND ranked.rn = 1), ARRAY[]::uuid[]),
         COALESCE(array_agg(ranked.segment_id ORDER BY ranked.position, ranked.id) FILTER (WHERE ranked.eligible AND ranked.rn = 1), ARRAY[]::uuid[])
    INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids, v_seg_by_id
    FROM ranked;

  -- Mesma GUC transacional do replace_talkx_draft_recipients: e o que autoriza os
  -- gatilhos de talkx_recipients/talkx_campaigns nesta transacao.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id)
  SELECT p_campaign_id, destinatario.contact_id, destinatario.segment_id
    FROM unnest(v_ids, v_seg_by_id) AS destinatario(contact_id, segment_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_count,
         audience_snapshot_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'suppressed', v_suppressed,
    'skipped_invalid', v_skipped_invalid
  );
END;
$function$
