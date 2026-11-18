-- X065 — fecha o teste A/B de campanha no banco.
--
-- Resgate da fatia de UI da branch claude/ga-ci-verde-261020 (nunca mergeada),
-- que trazia o painel "Teste A/B" em TalkXCampaignRunning.tsx lendo
-- `campaign.ab_enabled/ab_metric/ab_min_sample/ab_winner_variant_id` e uma RPC
-- de estatistica por variante. Nada disso existia no banco, entao o painel era
-- uma tela sem backend. Esta migration entrega o backend que falta, na forma
-- que docs/talkx/v4/etapas/F06 (item X065) especifica.
--
-- JA FEITO ANTES DESTA MIGRATION (nao se repete aqui):
--   * soma de pesos = 100 por template, via trigger de constraint adiada
--     (20261011000021, funcao talkx_validate_template_variant_weights);
--   * atribuicao estavel por hash do contato (mesma migration, funcao
--     public.talkx_assign_variant(p_contact_id, p_template_id)).
--   Medido em 18/11/2026: as duas existem em producao, mas talkx_assign_variant
--   NAO era chamada por ninguem (`prosrc ILIKE '%talkx_assign_variant%'` casa so
--   com a propria definicao) e nenhum destinatario tinha variante
--   (`select count(*) from talkx_recipients where variant_id is not null` = 0).
--   Ou seja: a peca existia e estava desligada. Esta migration a liga.
--
-- SEGURANCA DE QUEM JA RODA: `ab_enabled` nasce FALSE. Com ele falso, o
-- snapshot de audiencia faz exatamente o que fazia antes (variant_id nulo).
-- Nenhuma campanha existente muda de comportamento sem alguem ligar o teste.
--
-- ROLLBACK (na ordem):
--   DROP FUNCTION IF EXISTS public.decide_talkx_ab_winner(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talkx_campaign_variant_stats(uuid);
--   -- e restaurar o corpo de snapshot_talkx_campaign_audience de 20261009032420
--   ALTER TABLE public.talkx_campaigns
--     DROP COLUMN IF EXISTS ab_enabled, DROP COLUMN IF EXISTS ab_metric,
--     DROP COLUMN IF EXISTS ab_min_sample, DROP COLUMN IF EXISTS ab_winner_variant_id,
--     DROP COLUMN IF EXISTS ab_winner_decided_at, DROP COLUMN IF EXISTS ab_winner_decided_by;
--   ALTER TABLE public.talkx_campaign_events DROP CONSTRAINT talkx_campaign_events_type_check;
--   -- e recriar a CHECK sem 'ab_winner_decided'

-- ─── 1. Colunas de A/B na campanha ──────────────────────────────────────────
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS ab_enabled           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_metric            text        NOT NULL DEFAULT 'reply_rate',
  ADD COLUMN IF NOT EXISTS ab_min_sample        integer     NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ab_winner_variant_id uuid        REFERENCES public.talkx_template_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ab_winner_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_winner_decided_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.talkx_campaigns'::regclass
       AND conname = 'talkx_campaigns_ab_metric_check'
  ) THEN
    ALTER TABLE public.talkx_campaigns
      ADD CONSTRAINT talkx_campaigns_ab_metric_check
      CHECK (ab_metric IN ('reply_rate', 'click_rate', 'delivery_rate'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.talkx_campaigns'::regclass
       AND conname = 'talkx_campaigns_ab_min_sample_check'
  ) THEN
    ALTER TABLE public.talkx_campaigns
      ADD CONSTRAINT talkx_campaigns_ab_min_sample_check
      CHECK (ab_min_sample >= 1 AND ab_min_sample <= 1000000);
  END IF;
END;
$$;

COMMENT ON COLUMN public.talkx_campaigns.ab_enabled IS
  'X065 — quando true, o snapshot de audiencia grava a variante de cada destinatario.';
COMMENT ON COLUMN public.talkx_campaigns.ab_metric IS
  'X065 — metrica que decide a vencedora: reply_rate, click_rate ou delivery_rate.';
COMMENT ON COLUMN public.talkx_campaigns.ab_min_sample IS
  'X065 — amostra minima POR VARIANTE para a decisao automatica aceitar um vencedor.';

-- ─── 2. O evento de decisao precisa caber na CHECK de event_type ────────────
ALTER TABLE public.talkx_campaign_events
  DROP CONSTRAINT IF EXISTS talkx_campaign_events_type_check;
ALTER TABLE public.talkx_campaign_events
  ADD CONSTRAINT talkx_campaign_events_type_check CHECK (event_type = ANY (ARRAY[
    'created','updated','scheduled','started','paused','resumed','cancelled','completed',
    'note','scheduled_updated','limits_updated','connection_failed','resumed_auto',
    'skipped_suppressed','suppression_add','suppression_remove','suppression_update',
    'segments_reviewed','checklist','link_created','link_updated','link_deleted',
    'investment_updated','report_exported','report_shared','import_created','import_completed',
    'ab_winner_decided'
  ]));

-- ─── 3. Estatistica por variante ────────────────────────────────────────────
-- Contagens do servidor; a tela nunca divide pelo tamanho de um array.
CREATE OR REPLACE FUNCTION public.talkx_campaign_variant_stats(p_campaign_id uuid)
RETURNS TABLE (
  variant_id  uuid,
  label       text,
  weight      integer,
  total       bigint,
  sent        bigint,
  deliveries  bigint,
  reads       bigint,
  replies     bigint,
  clicks      bigint,
  reply_rate     numeric,
  click_rate     numeric,
  delivery_rate  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true
   LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Mesma regra de leitura do resto da campanha: dono ou admin/supervisor.
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id,
         v.label,
         v.weight,
         count(r.id)                                              AS total,
         count(r.id) FILTER (WHERE r.sent_at      IS NOT NULL)     AS sent,
         count(r.id) FILTER (WHERE r.delivered_at IS NOT NULL)     AS deliveries,
         count(r.id) FILTER (WHERE r.read_at      IS NOT NULL)     AS reads,
         count(r.id) FILTER (WHERE r.replied_at   IS NOT NULL)     AS replies,
         count(r.id) FILTER (WHERE r.clicked_at   IS NOT NULL)     AS clicks,
         -- Taxas sobre o total de destinatarios da variante; 0 destinatarios -> 0.
         CASE WHEN count(r.id) > 0
              THEN round(count(r.id) FILTER (WHERE r.replied_at   IS NOT NULL)::numeric * 100 / count(r.id), 2)
              ELSE 0 END,
         CASE WHEN count(r.id) > 0
              THEN round(count(r.id) FILTER (WHERE r.clicked_at   IS NOT NULL)::numeric * 100 / count(r.id), 2)
              ELSE 0 END,
         CASE WHEN count(r.id) > 0
              THEN round(count(r.id) FILTER (WHERE r.delivered_at IS NOT NULL)::numeric * 100 / count(r.id), 2)
              ELSE 0 END
    FROM public.talkx_template_variants AS v
    LEFT JOIN public.talkx_recipients AS r
           ON r.campaign_id = p_campaign_id
          AND r.variant_id = v.id
   WHERE v.template_id = v_campaign.template_id
   GROUP BY v.id, v.label, v.weight
   ORDER BY v.label;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_campaign_variant_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_variant_stats(uuid) TO authenticated;
COMMENT ON FUNCTION public.talkx_campaign_variant_stats(uuid) IS
  'X065 — destinatarios, enviadas, entregues, lidas, respostas, cliques e taxas por variante da campanha.';

-- ─── 4. Decisao da vencedora ────────────────────────────────────────────────
-- Dois caminhos, ambos com ator registrado no evento:
--   * manual   (p_variant_id informado): so admin/supervisor, sem exigir amostra;
--   * automatica (p_variant_id nulo): exige amostra >= ab_min_sample em CADA
--     variante e diferenca >= 2 erros-padrao entre a primeira e a segunda
--     colocada na metrica da campanha. Nao atingiu -> 'insufficient_data' e
--     NADA e gravado.
CREATE OR REPLACE FUNCTION public.decide_talkx_ab_winner(
  p_campaign_id uuid,
  p_variant_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_metric   text;
  v_min      integer;
  v_primeira record;
  v_segunda  record;
  v_erro_padrao numeric;
  v_diferenca   numeric;
  v_menor_amostra bigint;
  v_variantes integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid() AND profile.is_active = true
   LIMIT 1;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- Decidir vencedora muda o que a equipe vai replicar: ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_campaign.ab_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_ab_not_enabled' USING ERRCODE = '22023';
  END IF;

  v_metric := COALESCE(v_campaign.ab_metric, 'reply_rate');
  v_min    := COALESCE(v_campaign.ab_min_sample, 50);

  -- Ranking pela metrica da campanha, com a taxa como fracao (0..1) para o
  -- erro-padrao sair na mesma escala. A estatistica e relida a cada passo em vez
  -- de ir para uma tabela temporaria: `CREATE TEMP TABLE` com nome fixo quebra
  -- se a mesma transacao decidir duas campanhas, e aqui o conjunto tem o tamanho
  -- do numero de variantes do template (unidades).
  SELECT count(*)::integer, COALESCE(min(s.total), 0)
    INTO v_variantes, v_menor_amostra
    FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s;
  IF v_variantes < 2 THEN
    RETURN jsonb_build_object('status', 'insufficient_data', 'reason', 'less_than_two_variants',
                              'variants', v_variantes);
  END IF;

  IF p_variant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s
       WHERE s.variant_id = p_variant_id
    ) THEN
      RAISE EXCEPTION 'talkx_ab_variant_not_in_campaign' USING ERRCODE = '22023';
    END IF;

    UPDATE public.talkx_campaigns
       SET ab_winner_variant_id = p_variant_id,
           ab_winner_decided_at = statement_timestamp(),
           ab_winner_decided_by = v_actor_profile_id,
           updated_at           = statement_timestamp()
     WHERE id = p_campaign_id;

    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
    VALUES (p_campaign_id, 'ab_winner_decided', v_actor_profile_id,
            jsonb_build_object('mode', 'manual', 'variant_id', p_variant_id,
                               'metric', v_metric)::text);

    RETURN jsonb_build_object('status', 'decided', 'mode', 'manual',
                              'variant_id', p_variant_id, 'metric', v_metric);
  END IF;

  IF v_menor_amostra < v_min THEN
    RETURN jsonb_build_object('status', 'insufficient_data', 'reason', 'min_sample',
                              'min_sample', v_min, 'smallest_variant_sample', v_menor_amostra);
  END IF;

  SELECT s.variant_id, s.label, s.total,
         (CASE v_metric WHEN 'click_rate' THEN s.clicks
                        WHEN 'delivery_rate' THEN s.deliveries
                        ELSE s.replies END)::numeric / NULLIF(s.total, 0) AS taxa
    INTO v_primeira
    FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s
   ORDER BY (CASE v_metric WHEN 'click_rate' THEN s.clicks
                           WHEN 'delivery_rate' THEN s.deliveries
                           ELSE s.replies END)::numeric / NULLIF(s.total, 0) DESC NULLS LAST,
            s.label
   LIMIT 1;

  SELECT s.variant_id, s.label, s.total,
         (CASE v_metric WHEN 'click_rate' THEN s.clicks
                        WHEN 'delivery_rate' THEN s.deliveries
                        ELSE s.replies END)::numeric / NULLIF(s.total, 0) AS taxa
    INTO v_segunda
    FROM public.talkx_campaign_variant_stats(p_campaign_id) AS s
   WHERE s.variant_id <> v_primeira.variant_id
   ORDER BY (CASE v_metric WHEN 'click_rate' THEN s.clicks
                           WHEN 'delivery_rate' THEN s.deliveries
                           ELSE s.replies END)::numeric / NULLIF(s.total, 0) DESC NULLS LAST,
            s.label
   LIMIT 1;

  -- Erro-padrao da DIFERENCA entre duas proporcoes.
  v_erro_padrao := sqrt(
      (v_primeira.taxa * (1 - v_primeira.taxa)) / v_primeira.total
    + (v_segunda.taxa  * (1 - v_segunda.taxa))  / v_segunda.total
  );
  v_diferenca := v_primeira.taxa - v_segunda.taxa;

  -- Empate perfeito (erro-padrao 0 e diferenca 0) nao elege ninguem.
  IF v_erro_padrao IS NULL OR v_diferenca <= 0 OR v_diferenca < 2 * v_erro_padrao THEN
    RETURN jsonb_build_object('status', 'insufficient_data', 'reason', 'difference_within_noise',
                              'metric', v_metric,
                              'leader_rate', round(COALESCE(v_primeira.taxa, 0) * 100, 2),
                              'runner_up_rate', round(COALESCE(v_segunda.taxa, 0) * 100, 2),
                              'required_difference', round(COALESCE(2 * v_erro_padrao, 0) * 100, 2));
  END IF;

  UPDATE public.talkx_campaigns
     SET ab_winner_variant_id = v_primeira.variant_id,
         ab_winner_decided_at = statement_timestamp(),
         ab_winner_decided_by = v_actor_profile_id,
         updated_at           = statement_timestamp()
   WHERE id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'ab_winner_decided', v_actor_profile_id,
          jsonb_build_object('mode', 'automatic', 'variant_id', v_primeira.variant_id,
                             'metric', v_metric,
                             'leader_rate', round(v_primeira.taxa * 100, 2),
                             'runner_up_rate', round(v_segunda.taxa * 100, 2))::text);

  RETURN jsonb_build_object('status', 'decided', 'mode', 'automatic',
                            'variant_id', v_primeira.variant_id, 'metric', v_metric,
                            'leader_rate', round(v_primeira.taxa * 100, 2),
                            'runner_up_rate', round(v_segunda.taxa * 100, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.decide_talkx_ab_winner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_talkx_ab_winner(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.decide_talkx_ab_winner(uuid, uuid) IS
  'X065 — elege a variante vencedora: manual (admin/supervisor) ou automatica com amostra minima e diferenca de 2 erros-padrao.';

-- ─── 5. O snapshot passa a gravar a variante quando o A/B esta ligado ───────
-- Corpo identico ao que estava em producao em 18/11/2026 (origem:
-- 20261009032420_x057b_rpc_segmentos), com DUAS mudancas, ambas marcadas
-- com "X065" abaixo: a variavel v_ab e a coluna variant_id no INSERT.
-- Com ab_enabled = false (o padrao) o resultado e byte a byte o de antes.
CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience(
  p_campaign_id uuid,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
  v_ab boolean := false;  -- X065
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

  -- X065: so atribui variante com o A/B ligado E com o template tendo variantes.
  -- Template sem variante com ab_enabled ligado nao e erro: segue sem variante,
  -- porque talkx_assign_variant levantaria excecao e derrubaria o snapshot inteiro.
  v_ab := COALESCE(v_campaign.ab_enabled, false)
          AND v_campaign.template_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.talkx_template_variants AS tv
             WHERE tv.template_id = v_campaign.template_id
          );

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

  -- X065: variant_id sai de talkx_assign_variant (hash estavel do contato contra
  -- a faixa de pesos, 20261011000021). Mesmo contato, mesmo template -> mesma
  -- variante em qualquer re-snapshot.
  INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id, variant_id)
  SELECT p_campaign_id,
         destinatario.contact_id,
         destinatario.segment_id,
         CASE WHEN v_ab
              THEN public.talkx_assign_variant(destinatario.contact_id, v_campaign.template_id)
              ELSE NULL END
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
$$;

COMMENT ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint) IS
  'X057b + X065 — congela a audiencia da campanha e, com ab_enabled, grava a variante de cada destinatario por hash estavel.';
