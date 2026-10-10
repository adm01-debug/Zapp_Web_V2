-- 20261010_talkx_campaigns_ab_testing
-- N-119: vencedor do teste A/B gravado na campanha (bloco 9 do plano).
-- Pre-requisito: public.talkx_template_variants ja existe
-- (20260909150000_talkx_template_variants_ab.sql) com weight integer NOT NULL
-- DEFAULT 50 CHECK (weight > 0 AND weight <= 100) e template_id NOT NULL
-- REFERENCES public.talkx_templates(id) ON DELETE CASCADE; public.talkx_recipients
-- ja tem variant_id (idem), reply_message_id (E88) e clicked_at (E90).
-- Esta migration nao recria nada disso.
-- Rollback: reverter colunas AB, indice parcial, trigger e funcoes de verificacao de pesos e decisao de vencedor
--   DROP FUNCTION IF EXISTS public.talkx_decide_ab_winners(integer, text);
--   DROP FUNCTION IF EXISTS public.talkx_determine_winner(uuid, integer, text);
--   DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
--   DROP FUNCTION IF EXISTS public.talkx_check_variant_weights();
--   DROP INDEX IF EXISTS public.idx_talkx_campaigns_ab_pending;
--   ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_enabled_metric_check;
--   ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_metric_check;
--   ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_min_sample_check;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_decided_by;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_decided_at;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_variant_id;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_min_sample;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_metric;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_enabled;

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS ab_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_metric text,
  ADD COLUMN IF NOT EXISTS ab_min_sample integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ab_winner_variant_id uuid REFERENCES public.talkx_template_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ab_winner_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_winner_decided_by text;

-- Amostra minima sempre positiva: 0 ou negativo nunca decide (antes aceitava).
ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_min_sample_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_ab_min_sample_check
  CHECK (ab_min_sample > 0);

-- Vocabulario fechado da metrica (vazio '' ja cai aqui: nao e NULL nem membro).
ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_metric_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_ab_metric_check
  CHECK (ab_metric IS NULL OR ab_metric IN ('reply_rate', 'click_rate', 'delivered_rate'));

-- AB ligado exige metrica: sem metrica nao ha o que decidir (antes o NULL
-- voltava silencioso da funcao). Sem DEFAULT em ab_metric de proposito: ligar o
-- AB precisa escolher a metrica de sucesso explicitamente.
ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_enabled_metric_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_ab_enabled_metric_check
  CHECK (ab_enabled = false OR ab_metric IS NOT NULL);

-- Lote do tick: so campanhas AB ainda sem decisao.
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_ab_pending
  ON public.talkx_campaigns (created_at, id)
  WHERE ab_enabled AND ab_winner_variant_id IS NULL;

-- Calcula o vencedor E GRAVA na campanha na mesma transacao (bloco 9: "vence e
-- grava"). Retorna o variant_id vencedor ou NULL (AB desligado, sem metrica ou
-- amostra insuficiente: nada a decidir, nada e gravado).
-- p_min_sample opcional: NULL usa o ab_min_sample da campanha.
CREATE OR REPLACE FUNCTION public.talkx_determine_winner(p_campaign_id uuid, p_min_sample integer DEFAULT NULL, p_decided_by text DEFAULT 'talkx-scheduler')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean;
  v_metric text;
  v_min_sample integer;
  v_current_winner uuid;
  v_winner_variant_id uuid;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'p_campaign_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_min_sample IS NOT NULL AND p_min_sample <= 0 THEN
    RAISE EXCEPTION 'p_min_sample must be > 0 (got %)', p_min_sample USING ERRCODE = '22023';
  END IF;
  IF p_decided_by IS NULL OR btrim(p_decided_by) = '' THEN
    RAISE EXCEPTION 'p_decided_by is required' USING ERRCODE = '22023';
  END IF;

  SELECT c.ab_enabled, c.ab_metric, c.ab_min_sample, c.ab_winner_variant_id
  INTO v_enabled, v_metric, v_min_sample, v_current_winner
  FROM public.talkx_campaigns c
  WHERE c.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign % not found', p_campaign_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NULL;
  END IF;
  IF v_metric IS NULL THEN
    RETURN NULL;
  END IF;

  v_min_sample := COALESCE(p_min_sample, v_min_sample);
  IF v_min_sample IS NULL OR v_min_sample <= 0 THEN
    RAISE EXCEPTION 'ab_min_sample must be > 0 (got %)', v_min_sample USING ERRCODE = '22023';
  END IF;

  WITH variant_stats AS (
    SELECT
      r.variant_id,
      COUNT(*) AS sample_size,
      CASE v_metric
        WHEN 'reply_rate' THEN
          COUNT(r.reply_message_id)::numeric / NULLIF(COUNT(*), 0)
        WHEN 'click_rate' THEN
          COUNT(r.clicked_at)::numeric / NULLIF(COUNT(*), 0)
        WHEN 'delivered_rate' THEN
          COUNT(r.delivered_at)::numeric / NULLIF(COUNT(*), 0)
      END AS metric_value
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign_id
      AND r.variant_id IS NOT NULL
    GROUP BY r.variant_id
    HAVING COUNT(*) >= v_min_sample
  )
  SELECT vs.variant_id INTO v_winner_variant_id
  FROM variant_stats vs
  ORDER BY vs.metric_value DESC, vs.sample_size DESC
  LIMIT 1;

  IF v_winner_variant_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_current_winner IS NOT DISTINCT FROM v_winner_variant_id THEN
    RETURN v_winner_variant_id;
  END IF;

  UPDATE public.talkx_campaigns
  SET ab_winner_variant_id = v_winner_variant_id,
      ab_winner_decided_at = now(),
      ab_winner_decided_by = p_decided_by
  WHERE id = p_campaign_id;

  RETURN v_winner_variant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_determine_winner(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_determine_winner(uuid, integer, text) TO service_role;

-- Lote do tick: UMA chamada decide e grava os vencedores de ate p_limit
-- campanhas AB ainda sem decisao. Linhas travadas por outro decisor sao
-- puladas (SKIP LOCKED): dois ticks concorrentes nunca decidem a mesma
-- campanha duas vezes. Retorna so as campanhas decididas nesta chamada.
-- O limite e de DECISOES, nao de linhas examinadas: campanhas sem amostra
-- (vencedor NULL) nao consomem o lote nem bloqueiam as seguintes — por isso nao
-- ha offset; o filtro "sem decisao" faz o progresso sozinho.
CREATE OR REPLACE FUNCTION public.talkx_decide_ab_winners(p_limit integer DEFAULT 25, p_decided_by text DEFAULT 'talkx-scheduler')
RETURNS TABLE (campaign_id uuid, winner_variant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_winner uuid;
  v_decided integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100 (got %)', p_limit USING ERRCODE = '22023';
  END IF;
  IF p_decided_by IS NULL OR btrim(p_decided_by) = '' THEN
    RAISE EXCEPTION 'p_decided_by is required' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT c.id
    FROM public.talkx_campaigns c
    WHERE c.ab_enabled
      AND c.ab_winner_variant_id IS NULL
    ORDER BY c.created_at NULLS LAST, c.id
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_decided >= p_limit;
    v_winner := public.talkx_determine_winner(r.id, NULL, p_decided_by);
    IF v_winner IS NOT NULL THEN
      campaign_id := r.id;
      winner_variant_id := v_winner;
      v_decided := v_decided + 1;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_decide_ab_winners(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_decide_ab_winners(integer, text) TO service_role;

-- Soma dos pesos = 100 por template QUE TENHA variantes (checada no commit, para
-- permitir inserir o conjunto balanceado na mesma transacao).
-- O conjunto VAZIO passa de proposito: template sem variante nao faz AB (e o
-- DELETE do template remove as variantes em cascata — exigir soma 100 do vazio
-- tornaria o template com variantes indeletavel). Peso NULL/negativo e template
-- pai ja sao barrados na origem: weight e NOT NULL CHECK (weight > 0 AND
-- weight <= 100) e template_id e NOT NULL REFERENCES talkx_templates
-- (20260909150000_talkx_template_variants_ab.sql).
CREATE OR REPLACE FUNCTION public.talkx_check_variant_weights()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template uuid := COALESCE(NEW.template_id, OLD.template_id);
  v_count integer;
  v_sum integer;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(weight), 0) INTO v_count, v_sum
  FROM public.talkx_template_variants WHERE template_id = v_template;
  IF v_count > 0 AND v_sum <> 100 THEN
    RAISE EXCEPTION 'Variant weights of template % must sum to 100 (got %)', v_template, v_sum
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_check_variant_weights() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
CREATE CONSTRAINT TRIGGER talkx_template_variants_weight_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.talkx_template_variants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.talkx_check_variant_weights();
