-- talkx_templates_current_version
--
-- rollback: DROP FUNCTION IF EXISTS public.update_talkx_template_with_snapshot(uuid, timestamp with time zone, text, text, text, text, text, text, text[], text, text[]); e recriar o corpo de supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql (md5 do corpo: d31df280ef0813c1ba475704b4dc30f0), depois ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS current_version_id;. As linhas de versao criadas por esta migration (o estado corrente de cada template) podem ficar: sao historico valido.

-- 1) talkx_templates.current_version_id — versao do conteudo VIVO --------------
-- Problema (provado na V26): update_talkx_template_with_snapshot arquivava em
-- talkx_template_versions apenas o estado ANTERIOR a edicao, e o UPDATE nao
-- gerava linha nenhuma. Resultado: max(version_number) estava sempre uma edicao
-- atras do conteudo vivo e nenhuma versao correspondia ao template aplicado.
ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS current_version_id uuid
  REFERENCES public.talkx_template_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.talkx_templates.current_version_id IS
  'Versao (talkx_template_versions.id) que corresponde ao conteudo VIVO do template. Mantida por update_talkx_template_with_snapshot.';

-- 2) Backfill: os templates que ja existem ganham uma versao do estado ATUAL ---
WITH falta AS (
  SELECT template.id,
         template.name, template.description, template.content, template.category,
         template.status, template.media_url, template.media_type, template.tags,
         template.custom_variables, template.created_by, template.updated_at,
         COALESCE((
           SELECT max(history.version_number)
           FROM public.talkx_template_versions history
           WHERE history.template_id = template.id
         ), 0) + 1 AS proxima_versao
  FROM public.talkx_templates template
  WHERE template.current_version_id IS NULL
)
INSERT INTO public.talkx_template_versions (
  template_id, version_number, name, description, content, category, status,
  media_url, media_type, tags, custom_variables, saved_by, created_at
)
SELECT id, proxima_versao, name, description, content, category, status,
       media_url, media_type, COALESCE(tags, '{}'::text[]),
       COALESCE(custom_variables, '{}'::text[]), created_by, now()
FROM falta;

UPDATE public.talkx_templates template
SET current_version_id = versao.id
FROM public.talkx_template_versions versao
WHERE template.current_version_id IS NULL
  AND versao.template_id = template.id
  AND versao.version_number = (
    SELECT max(v2.version_number)
    FROM public.talkx_template_versions v2
    WHERE v2.template_id = template.id
  );

-- 3) update_talkx_template_with_snapshot passa a arquivar tambem o estado NOVO -

CREATE OR REPLACE FUNCTION public.update_talkx_template_with_snapshot(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_description text,
  p_category text,
  p_content text,
  p_media_url text,
  p_media_type text,
  p_tags text[],
  p_status text,
  p_custom_variables text[]
) RETURNS TABLE(template_id uuid, updated_at timestamptz, version_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_template public.talkx_templates%ROWTYPE;
  v_version_number integer;
  v_current_version_id uuid;
  v_current_version_number integer;
  v_updated_at timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_actor_profile_id := public.get_profile_id_for_user(auth.uid());
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'authenticated_profile_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_template
  FROM public.talkx_templates template
  WHERE template.id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_template.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_template_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
     OR v_template.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'talkx_template_stale_version' USING ERRCODE = '40001';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
     OR p_content IS NULL OR length(p_content) NOT BETWEEN 1 AND 65536
     OR p_status IS NULL
     OR p_status NOT IN ('draft', 'review', 'approved')
     OR (p_description IS NOT NULL AND length(p_description) > 4000)
     OR (p_media_url IS NOT NULL AND (
       length(p_media_url) > 8192 OR p_media_url !~ '^https://'
     ))
     OR (p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR COALESCE(cardinality(p_tags), 0) > 50
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_tags, '{}'::text[])) tag
       WHERE length(tag) NOT BETWEEN 1 AND 64
     )
     OR COALESCE(cardinality(p_custom_variables), 0) > 100
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) variable
       WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
     )
     OR cardinality(ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) value))
        IS DISTINCT FROM cardinality(COALESCE(p_custom_variables, '{}'::text[])) THEN
    RAISE EXCEPTION 'invalid_talkx_template' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(history.version_number), 0) + 1
  INTO v_version_number
  FROM public.talkx_template_versions history
  WHERE history.template_id = p_template_id;

  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at
  ) VALUES (
    v_template.id, v_version_number, v_template.name, v_template.description,
    v_template.content, v_template.category, v_template.status, v_template.media_url,
    v_template.media_type, COALESCE(v_template.tags, '{}'::text[]),
    COALESCE(v_template.custom_variables, '{}'::text[]),
    v_actor_profile_id, v_updated_at
  );

  UPDATE public.talkx_templates template
  SET name = btrim(p_name),
      description = p_description,
      category = btrim(p_category),
      content = p_content,
      media_url = p_media_url,
      media_type = p_media_type,
      tags = COALESCE(p_tags, '{}'::text[]),
      status = p_status,
      custom_variables = COALESCE(p_custom_variables, '{}'::text[]),
      updated_at = v_updated_at
  WHERE template.id = p_template_id
  -- The pre-existing updated_at trigger may use transaction_timestamp().
  -- Return the value actually persisted, never the pre-trigger candidate.
  RETURNING template.updated_at INTO v_updated_at;

  -- Arq(te)iva o estado NOVO (o conteudo que acabou de ficar vivo) e aponta
  -- current_version_id para ele. Antes disso, a unica linha arquivada era o
  -- estado ANTERIOR, entao nenhuma versao correspondia ao conteudo vivo.
  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at
  ) VALUES (
    p_template_id, v_version_number + 1, btrim(p_name), p_description,
    p_content, btrim(p_category), p_status, p_media_url, p_media_type,
    COALESCE(p_tags, '{}'::text[]), COALESCE(p_custom_variables, '{}'::text[]),
    v_actor_profile_id, v_updated_at
  )
  -- RETURNING qualificado: RETURNS TABLE declara "version_number" como variavel
  -- PL/pgSQL e a coluna de talkx_template_versions tem o mesmo nome — sem o
  -- prefixo, toda chamada levanta 42702 (column reference is ambiguous).
  RETURNING public.talkx_template_versions.id, public.talkx_template_versions.version_number
  INTO v_current_version_id, v_current_version_number;

  UPDATE public.talkx_templates template
  SET current_version_id = v_current_version_id
  WHERE template.id = p_template_id;

  -- Devolve a versao do conteudo VIVO (arquivada acima), nao a anterior.
  RETURN QUERY SELECT p_template_id, v_updated_at, v_current_version_number;
END;
$function$;