-- N-103 Talk X: pesos das variantes somam 100 e atribuição estável
-- Rollback: drop trigger, function e colunas A/B adicionadas pela migration.
-- Rollback (SQL executável, na ordem):
--   DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
--   DROP FUNCTION IF EXISTS public.talkx_assign_variant(uuid, uuid);
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

-- Atribuicao estavel: o mesmo contato recebe a mesma variante em 2 snapshots.
-- Usa hash do contact_id mod 100 para escolher a variante com base nos pesos.
CREATE OR REPLACE FUNCTION public.talkx_assign_variant(
  p_contact_id uuid,
  p_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash integer;
  v_variant_id uuid;
  v_accumulated integer := 0;
BEGIN
  SELECT (abs(hashtext(p_contact_id::text)) % 100) INTO v_hash;

  FOR v_variant_id IN
    SELECT id FROM public.talkx_template_variants
    WHERE template_id = p_template_id
    ORDER BY label
  LOOP
    v_accumulated := v_accumulated + (
      SELECT weight FROM public.talkx_template_variants
      WHERE id = v_variant_id AND template_id = p_template_id
    );
    IF v_hash < v_accumulated THEN
      RETURN v_variant_id;
    END IF;
  END LOOP;

  -- Fallback: retorna a ultima variante se o hash nao caiu em nenhuma (deve nao acontecer se os pesos somam 100).
  SELECT id INTO v_variant_id FROM public.talkx_template_variants
  WHERE template_id = p_template_id
  ORDER BY label DESC
  LIMIT 1;
  RETURN v_variant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_assign_variant(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_assign_variant(uuid, uuid) TO service_role;