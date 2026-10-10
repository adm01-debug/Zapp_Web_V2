-- 20261010_talkx_campaigns_ab_testing
-- Pré-requisito: public.snapshot_talkx_campaign_audience já existe (20261002421230_talkx_audience_snapshot.sql);
-- esta migration não a recria.
-- Rollback: reverter colunas AB, drop trigger e funções de verificação de pesos e determinação de vencedor
--   DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
--   DROP FUNCTION IF EXISTS public.talkx_check_variant_weights();
--   DROP FUNCTION IF EXISTS public.talkx_determine_winner(uuid, integer);
--   ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_metric_check;
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

ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_ab_metric_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_ab_metric_check
  CHECK (ab_metric IN ('reply_rate', 'click_rate', 'delivery_rate') OR ab_metric IS NULL);

-- p_min_sample é opcional: NULL usa o ab_min_sample da campanha.
CREATE OR REPLACE FUNCTION public.talkx_determine_winner(p_campaign_id uuid, p_min_sample integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_min_sample integer;
  v_metric text;
  v_winner_variant_id uuid;
BEGIN
  SELECT c.ab_min_sample, c.ab_metric
  INTO v_min_sample, v_metric
  FROM public.talkx_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign % not found', p_campaign_id USING ERRCODE = 'P0001';
  END IF;

  v_min_sample := COALESCE(p_min_sample, v_min_sample);

  IF v_metric IS NULL OR v_min_sample IS NULL THEN
    RETURN NULL;
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
        WHEN 'delivery_rate' THEN
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

  RETURN v_winner_variant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_determine_winner(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_determine_winner(uuid, integer) TO service_role;

-- Soma dos pesos = 100 por template que tenha variantes (checada no commit).
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
