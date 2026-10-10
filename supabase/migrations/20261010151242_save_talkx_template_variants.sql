-- save_talkx_template_variants: grava o conjunto de variantes A/B/C de um template numa
-- transacao atomica (0, 2 ou 3 variantes; 1 isolada nao e A/B).
-- Regras: p_variants precisa ser array JSON; exatamente um controle com conteudo (so
-- espacos nao conta); pesos inteiros > 0 somando 100; labels A/B/C sem duplicata; ids do
-- input precisam ser uuid valido e pertencer ao template; ids existentes sao preservados
-- (UPDATE por id, INSERT so para novas); remover variante com destinatario e recusado.
--
-- Rollback: DROP FUNCTION IF EXISTS public.save_talkx_template_variants(uuid, timestamptz, jsonb);

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
  v_current_updated_at timestamptz;
  v_is_owner boolean;
  v_is_admin boolean;
  v_variant_count integer;
  v_bad_count bigint;
  v_weight_sum integer;
  v_recipient_count bigint;
  v_input_ids uuid[];
  v_removed_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT t.updated_at INTO v_current_updated_at
  FROM public.talkx_templates t
  WHERE t.id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.talkx_templates t
           JOIN public.profiles p ON p.id = t.created_by
           WHERE t.id = p_template_id AND p.user_id = auth.uid()
         ),
         public.is_admin_or_supervisor(auth.uid())
  INTO v_is_owner, v_is_admin;
  IF v_is_owner IS NOT TRUE AND v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND p_expected_updated_at IS DISTINCT FROM v_current_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_template');
  END IF;

  -- Payload precisa ser array: nao normalizar para [] (nao apagar variantes por payload invalido)
  IF p_variants IS NULL OR jsonb_typeof(p_variants) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_variants_payload');
  END IF;

  v_variant_count := jsonb_array_length(p_variants);
  IF v_variant_count NOT IN (0, 2, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_variant_count');
  END IF;

  -- 0 variantes: remove todas, desde que nenhuma tenha destinatario
  IF v_variant_count = 0 THEN
    SELECT COUNT(*) INTO v_recipient_count
    FROM public.talkx_recipients r
    WHERE r.template_id = p_template_id;
    IF v_recipient_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talkx_variant_in_use');
    END IF;

    DELETE FROM public.talkx_template_variants WHERE template_id = p_template_id;
    GET DIAGNOSTICS v_removed_count = ROW_COUNT;

    UPDATE public.talkx_templates SET updated_at = now() WHERE id = p_template_id;
    RETURN jsonb_build_object('ok', true, 'saved_count', 0, 'removed_count', v_removed_count);
  END IF;

  -- Exatamente uma variante com conteudo, ignorando espacos
  SELECT COUNT(*) INTO v_bad_count
  FROM jsonb_array_elements(p_variants) AS v
  WHERE btrim(COALESCE(v->>'content', '')) <> '';
  IF v_bad_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exactly_one_variant_must_have_content');
  END IF;

  -- Labels validos
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variants) AS v
    WHERE v->>'label' IS NULL OR v->>'label' NOT IN ('A', 'B', 'C')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_label');
  END IF;

  -- Labels duplicados
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variants) AS v
    GROUP BY v->>'label' HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_label');
  END IF;

  -- Pesos: precisam ser numero inteiro > 0 (CASE garante a ordem do cast)
  SELECT COUNT(*) INTO v_bad_count
  FROM jsonb_array_elements(p_variants) AS v
  WHERE NOT (v ? 'weight')
     OR jsonb_typeof(v->'weight') <> 'number'
     OR CASE WHEN (v->>'weight') ~ '^[0-9]+$' THEN (v->>'weight')::numeric <= 0
             ELSE true END;
  IF v_bad_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_weight');
  END IF;

  SELECT SUM((v->>'weight')::integer) INTO v_weight_sum
  FROM jsonb_array_elements(p_variants) AS v;
  IF v_weight_sum <> 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weights_must_sum_to_100');
  END IF;

  -- ids do input: precisam ter formato uuid (quando presentes)
  SELECT COUNT(*) INTO v_bad_count
  FROM jsonb_array_elements(p_variants) AS v
  WHERE v->>'id' IS NOT NULL
    AND (v->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_bad_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_variant_id');
  END IF;

  SELECT array_agg(DISTINCT (v->>'id')::uuid)
  INTO v_input_ids
  FROM jsonb_array_elements(p_variants) AS v
  WHERE v->>'id' IS NOT NULL;

  -- ids do input precisam pertencer a este template
  IF v_input_ids IS NOT NULL THEN
    SELECT COUNT(*) INTO v_bad_count
    FROM unnest(v_input_ids) AS x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.talkx_template_variants t
      WHERE t.id = x.id AND t.template_id = p_template_id
    );
    IF v_bad_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'variant_not_found');
    END IF;
  END IF;

  -- Recusar remocao de variante que ja tem destinatario
  SELECT COUNT(*) INTO v_recipient_count
  FROM public.talkx_recipients r
  WHERE r.template_id = p_template_id
    AND r.variant_id IS NOT NULL
    AND (v_input_ids IS NULL OR r.variant_id <> ALL(v_input_ids));
  IF v_recipient_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'talkx_variant_in_use');
  END IF;

  -- Remover (num unico DELETE) as variantes que nao estao no input
  DELETE FROM public.talkx_template_variants
  WHERE template_id = p_template_id
    AND (v_input_ids IS NULL OR id <> ALL(v_input_ids));
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  -- Atualizar as existentes pelo id (preserva o id)
  UPDATE public.talkx_template_variants t
  SET label      = n.label,
      content    = n.content,
      media_url  = n.media_url,
      media_type = n.media_type,
      weight     = n.weight
  FROM (
    SELECT (v->>'id')::uuid            AS id,
           v->>'label'                 AS label,
           COALESCE(v->>'content', '') AS content,
           v->>'media_url'             AS media_url,
           v->>'media_type'            AS media_type,
           (v->>'weight')::integer     AS weight
    FROM jsonb_array_elements(p_variants) AS v
    WHERE v->>'id' IS NOT NULL
  ) AS n
  WHERE t.id = n.id AND t.template_id = p_template_id;

  -- Inserir apenas as novas (sem id)
  INSERT INTO public.talkx_template_variants (template_id, label, content, media_url, media_type, weight)
  SELECT p_template_id,
         v->>'label',
         COALESCE(v->>'content', ''),
         v->>'media_url',
         v->>'media_type',
         (v->>'weight')::integer
  FROM jsonb_array_elements(p_variants) AS v
  WHERE v->>'id' IS NULL;

  UPDATE public.talkx_templates SET updated_at = now() WHERE id = p_template_id;
  RETURN jsonb_build_object('ok', true, 'saved_count', v_variant_count, 'removed_count', v_removed_count);
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.save_talkx_template_variants(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_template_variants(uuid, timestamptz, jsonb) TO authenticated;
