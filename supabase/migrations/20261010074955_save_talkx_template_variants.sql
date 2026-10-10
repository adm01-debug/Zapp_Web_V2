-- save_talkx_template_variants: RPC para salvar o conjunto de variantes A/B/C de um template
-- em uma única transação atômica.
--
-- Assinatura: save_talkx_template_variants(p_template_id uuid, p_expected_updated_at timestamptz, p_variants jsonb)
--
-- Regras de negócio:
--   - 0, 2 ou 3 variantes permitidas (1 variante isolada não é um conjunto A/B)
--   - Exatamente uma variante deve ter conteúdo não-vazio (o controle)
--   - Pesos devem somar 100
--   - Labels válidos: A, B ou C, sem duplicatas
--   - IDs existentes no input devem pertencer ao template
--   - Variante existente com destinatários não pode ser removida (talkx_variant_in_use)
--   - IDs de variantes existentes são preservados; novas variantes recebem gen_random_uuid()
--
-- Rollback: DROP FUNCTION; não há dependências de DDL externas.

-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.save_talkx_template_variants(uuid, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.save_talkx_template_variants(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_variants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_template_exists boolean;
  v_current_updated_at timestamptz;
  v_template_content text;
  v_is_owner boolean;
  v_is_admin boolean;
  v_variant_count integer;
  v_content_count integer;
  v_weight_sum integer;
  v_recipient_count bigint;
  v_variant jsonb;
  v_label text;
  v_id uuid;
  v_existing_id uuid;
  v_existing_variant_ids uuid[];
  v_input_ids uuid[];
  v_id_to_remove uuid;
BEGIN
  -- Autenticação
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Template existe?
  SELECT t.updated_at, t.content
  INTO v_current_updated_at, v_template_content
  FROM public.talkx_templates t
  WHERE t.id = p_template_id;
  v_template_exists := FOUND;

  IF v_template_exists IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  -- Permissão: dono do template (via profile) ou admin/supervisor
  SELECT EXISTS (
    SELECT 1 FROM public.talkx_templates t
    JOIN public.profiles p ON p.id = t.created_by
    WHERE t.id = p_template_id AND p.user_id = auth.uid()
  ), public.is_admin_or_supervisor(auth.uid())
  INTO v_is_owner, v_is_admin;

  IF v_is_owner IS NOT TRUE AND v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Otimistic locking
  IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at IS DISTINCT FROM v_current_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_template');
  END IF;

  -- Normalizar p_variants para array
  IF p_variants IS NULL OR jsonb_typeof(p_variants) != 'array' THEN
    p_variants := '[]'::jsonb;
  END IF;

  v_variant_count := jsonb_array_length(p_variants);

  -- Quantidade de variantes: 0, 2 ou 3
  IF v_variant_count NOT IN (0, 2, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_variant_count');
  END IF;

  -- 0 variantes: remove todas, mas verificar se ha recipients
  IF v_variant_count = 0 THEN
    SELECT COUNT(*) INTO v_recipient_count
    FROM public.talkx_recipients
    WHERE template_id = p_template_id;
    IF v_recipient_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talkx_variant_in_use');
    END IF;
    DELETE FROM public.talkx_template_variants
    WHERE template_id = p_template_id;
    RETURN jsonb_build_object('ok', true, 'saved_count', 0, 'removed_count', 0);
  END IF;

  -- Exatamente uma variante com conteudo nao-vazio (o controle)
  SELECT COUNT(*) INTO v_content_count
  FROM jsonb_array_elements(p_variants) AS v
  WHERE v->>'content' IS NOT NULL AND v->>'content' != '';

  IF v_content_count != 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exactly_one_variant_must_have_content');
  END IF;

  -- Pesos somam 100
  SELECT COALESCE(SUM((v->>'weight')::integer), 0) INTO v_weight_sum
  FROM jsonb_array_elements(p_variants) AS v;

  IF v_weight_sum != 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weights_must_sum_to_100');
  END IF;

  -- Labels válidos (A, B ou C)
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variants) AS v
    WHERE v->>'label' NOT IN ('A', 'B', 'C')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_label');
  END IF;

  -- Duplicatas de label no input
  SELECT COUNT(*) INTO v_content_count
  FROM (
    SELECT 1 FROM jsonb_array_elements(p_variants) AS v
    GROUP BY v->>'label'
    HAVING COUNT(*) > 1
  ) AS dup;

  IF v_content_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_label');
  END IF;

  -- IDs existentes no input (para preservar)
  SELECT array_agg(DISTINCT (v->>'id')::uuid) INTO v_input_ids
  FROM jsonb_array_elements(p_variants) AS v
  WHERE v->>'id' IS NOT NULL;

  -- IDs das variantes existentes no banco para este template
  SELECT array_agg(id) INTO v_existing_variant_ids
  FROM public.talkx_template_variants
  WHERE template_id = p_template_id;

  -- IDs que existem no input mas não no banco (novos) — OK
  -- IDs que existem no banco mas não no input (a remover) — verificar recipients
  IF v_existing_variant_ids IS NOT NULL THEN
    FOREACH v_id_to_remove IN ARRAY v_existing_variant_ids
    LOOP
      IF v_input_ids IS NULL OR NOT (v_id_to_remove = ANY(v_input_ids)) THEN
        SELECT COUNT(*) INTO v_recipient_count
        FROM public.talkx_recipients
        WHERE variant_id = v_id_to_remove;

        IF v_recipient_count > 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'talkx_variant_in_use');
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Validar que IDs existentes no input realmente existem no banco
  IF v_input_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_input_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.talkx_template_variants
        WHERE id = v_id AND template_id = p_template_id
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'variant_not_found');
      END IF;
    END LOOP;
  END IF;

  -- Tudo validado: aplicar as mudanças

  -- Remover variantes que não estão no input (já verificado que não têm recipients)
  IF v_existing_variant_ids IS NOT NULL THEN
    FOREACH v_id_to_remove IN ARRAY v_existing_variant_ids
    LOOP
      IF v_input_ids IS NULL OR NOT (v_id_to_remove = ANY(v_input_ids)) THEN
        DELETE FROM public.talkx_template_variants WHERE id = v_id_to_remove;
      END IF;
    END LOOP;
  END IF;

  -- Upsert das variantes do input (preserva IDs existentes, gera novos se faltar)
  INSERT INTO public.talkx_template_variants (id, template_id, label, content, media_url, media_type, weight)
  SELECT
    COALESCE((v->>'id')::uuid, gen_random_uuid()),
    p_template_id,
    v->>'label',
    v->>'content',
    v->>'media_url',
    v->>'media_type',
    (v->>'weight')::integer
  FROM jsonb_array_elements(p_variants) AS v
  ON CONFLICT (template_id, label) DO UPDATE SET
    content = EXCLUDED.content,
    media_url = EXCLUDED.media_url,
    media_type = EXCLUDED.media_type,
    weight = EXCLUDED.weight;

  -- Atualizar o updated_at do template
  UPDATE public.talkx_templates SET updated_at = now() WHERE id = p_template_id;

  RETURN jsonb_build_object('ok', true);
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.save_talkx_template_variants(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_template_variants(uuid, timestamptz, jsonb) TO authenticated;