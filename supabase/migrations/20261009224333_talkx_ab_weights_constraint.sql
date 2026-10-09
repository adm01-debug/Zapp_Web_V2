-- N-103 Talk X: pesos das variantes somam 100 e atribuição estável
-- Rollback: drop trigger, function e colunas A/B adicionadas pela migration.
-- Rollback (SQL executável, na ordem):
--   DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
--   DROP FUNCTION IF EXISTS public.talkx_validate_template_variant_weights();
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_decided_by;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_decided_at;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_winner_variant_id;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_min_sample;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_metric;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS ab_enabled;

CREATE OR REPLACE FUNCTION public.talkx_validate_template_variant_weights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum integer;
BEGIN
  SELECT COALESCE(SUM(weight), 0) INTO v_sum
  FROM public.talkx_template_variants
  WHERE template_id = NEW.template_id;

  IF v_sum <> 100 THEN
    RAISE EXCEPTION 'Variant weights for template % sum to %, expected 100', NEW.template_id, v_sum
      USING errcode = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
CREATE CONSTRAINT TRIGGER talkx_template_variants_weight_sum
AFTER INSERT OR UPDATE OF weight, template_id
ON public.talkx_template_variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.talkx_validate_template_variant_weights();

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS ab_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_metric text CHECK (ab_metric IN ('reply_rate', 'click_rate', 'delivery_rate')),
  ADD COLUMN IF NOT EXISTS ab_min_sample integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ab_winner_variant_id uuid REFERENCES public.talkx_template_variants(id),
  ADD COLUMN IF NOT EXISTS ab_winner_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_winner_decided_by uuid REFERENCES public.profiles(id);

REVOKE ALL ON FUNCTION public.talkx_validate_template_variant_weights() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_validate_template_variant_weights() TO service_role;