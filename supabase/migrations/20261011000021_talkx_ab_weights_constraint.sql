-- N-103 Talk X: pesos das variantes somam 100 e atribuicao estavel.
-- Escopo: apenas a constraint de soma de pesos e a funcao talkx_assign_variant.
-- Nao adiciona colunas (nenhum DDL de A/B aqui).
-- Rollback (SQL executavel, na ordem):
--   DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
--   DROP FUNCTION IF EXISTS public.talkx_assign_variant(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talkx_validate_template_variant_weights();

-- Constraint de soma de pesos, adiada para o fim da transacao.
-- Cobre INSERT, UPDATE (de weight ou de template_id) e DELETE:
--   * INSERT/UPDATE: o template de destino (NEW) precisa somar 100;
--   * UPDATE que troca template_id: o template de origem (OLD) tambem precisa somar 100;
--   * DELETE: o template de origem (OLD) precisa somar 100, exceto quando ele fica sem
--     variantes (todas apagadas) — nesse caso o template vazio e aceito.
CREATE OR REPLACE FUNCTION public.talkx_validate_template_variant_weights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS talkx_template_variants_weight_sum ON public.talkx_template_variants;
CREATE CONSTRAINT TRIGGER talkx_template_variants_weight_sum
AFTER INSERT OR UPDATE OF weight, template_id OR DELETE
ON public.talkx_template_variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.talkx_validate_template_variant_weights();

REVOKE ALL ON FUNCTION public.talkx_validate_template_variant_weights() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_validate_template_variant_weights() TO service_role;

-- Atribuicao estavel: o mesmo contato recebe a mesma variante em dois snapshots.
-- O bucket 0..99 e derivado do contato sem overflow de integer
-- (hashtext devolve integer; a mascara bigint evita 'integer out of range' em -2147483648).
-- Cada variante cobre o intervalo acumulado dos pesos; se nenhuma cobre o bucket,
-- a funcao levanta erro em vez de devolver variante por fallback silencioso.
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
$$;

REVOKE ALL ON FUNCTION public.talkx_assign_variant(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_assign_variant(uuid, uuid) TO service_role;
