-- talkx_current_version_backfill_fix
-- versao 20261001381230 (reservada por hermes-db-migrar) — AUTO-CONTIDA.
--
-- Substitui a 20261001371230_talkx_templates_current_version_v2.sql, mergeada mas
-- NAO APLICAVEL: o deploy pos-merge falhou com
--   HTTP 403 42501: talkx_template_update_requires_authorized_rpc
--
-- Causa (medida): o BACKFILL da v2 faz UPDATE direto em public.talkx_templates, e
-- public.guard_talkx_template_update (trigger trg_guard_talkx_template_update,
-- BEFORE UPDATE, definido em 20260909210000_canonicalize_talkx_template_history.sql)
-- so libera um UPDATE em talkx_templates em tres casos:
--   (1) current_user = 'service_role';
--   (2) muda SOMENTE use_count (NEW.use_count = OLD.use_count + 1, resto identico);
--   (3) existe snapshot em talkx_template_versions casado por statement_timestamp()
--       E saved_by = public.get_profile_id_for_user(auth.uid()).
-- O applier roda com current_user = 'postgres' (session_user = 'authenticator') e sem
-- auth.uid(), entao nenhum caso casa. SET ROLE / SET LOCAL ROLE e recusado
-- ("cannot set parameter role within security-definer function") porque o applier
-- chama uma funcao SECURITY DEFINER, e comandos de transacao tambem sao recusados.
--
-- Saida LIMPA (nenhum trigger/guarda desligado): o backfill roda dentro de uma funcao
-- SECURITY DEFINER cujo OWNER e service_role — dentro dela current_user vira
-- 'service_role' e o guard libera pelo caso (1).
--
-- rollback: ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS current_version_id; e recriar o corpo de public.update_talkx_template_with_snapshot da versao anterior (supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql, md5 do corpo d31df280ef0813c1ba475704b4dc30f0). As linhas de versao criadas pelo backfill sao historico valido e podem ficar; o ACL de public volta ao estado original (o GRANT CREATE de service_role e revertido no passo 6 desta migration).

-- 1) talkx_templates.current_version_id — versao do conteudo VIVO --------------
-- update_talkx_template_with_snapshot arquivava em talkx_template_versions apenas o
-- estado ANTERIOR a edicao, e o UPDATE nao gerava linha nenhuma: max(version_number)
-- ficava sempre uma edicao atras do conteudo vivo e nenhuma versao correspondia ao
-- template aplicado.
ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS current_version_id uuid
  REFERENCES public.talkx_template_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.talkx_templates.current_version_id IS
  'Versao (talkx_template_versions.id) que corresponde ao conteudo VIVO do template. Mantida por update_talkx_template_with_snapshot.';

-- 2) Backfill: os templates que ja existem ganham uma versao do estado ATUAL ---
-- Idempotente: so mexe em quem tem current_version_id IS NULL. O INSERT e o UPDATE
-- que aponta o ponteiro vivem num unico statement (CTE de escrita + UPDATE), para o
-- ponteiro ir exatamente para o id da versao recem-criada daquele template, sem
-- rematch por max(version_number).
CREATE OR REPLACE FUNCTION public.backfill_talkx_template_current_version()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_backfilled integer := 0;
BEGIN
  WITH falta AS (
    SELECT template.id,
           template.name, template.description, template.content, template.category,
           template.status, template.media_url, template.media_type, template.tags,
           template.custom_variables, template.created_by,
           COALESCE((
             SELECT max(history.version_number)
             FROM public.talkx_template_versions history
             WHERE history.template_id = template.id
           ), 0) + 1 AS proxima_versao
    FROM public.talkx_templates template
    WHERE template.current_version_id IS NULL
  ),
  arquivadas AS (
    INSERT INTO public.talkx_template_versions (
      template_id, version_number, name, description, content, category, status,
      media_url, media_type, tags, custom_variables, saved_by, created_at
    )
    SELECT id, proxima_versao, name, description, content, category, status,
           media_url, media_type, COALESCE(tags, '{}'::text[]),
           COALESCE(custom_variables, '{}'::text[]), created_by, now()
    FROM falta
    RETURNING template_id, id AS version_id
  )
  UPDATE public.talkx_templates template
  SET current_version_id = arquivadas.version_id
  FROM arquivadas
  WHERE template.id = arquivadas.template_id;

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RETURN v_backfilled;
END;
$function$;

-- 3) OWNER service_role: o unico caminho limpo para o guard liberar -------------
-- Dentro de uma funcao SECURITY DEFINER, current_user e o OWNER dela. Tornando
-- service_role owner, o backfill passa pelo caso (1) sem desligar trigger nem
-- guarda. Para assumir a posse, o NOVO owner precisa de CREATE no schema da funcao
-- (public): service_role tem apenas USAGE (medido: service_role=U/pg_database_owner).
-- Concede CREATE so enquanto esta migration roda e restaura o ACL no passo 6; nao
-- concede nada se ja existir. A marca 'talkx.*' e um GUC de sessao (nome pontuado,
-- exigido pelo PostgreSQL para parametros customizados) que so decide o passo 6.
DO $do$
BEGIN
  IF NOT has_schema_privilege('service_role', 'public', 'CREATE') THEN
    EXECUTE 'GRANT CREATE ON SCHEMA public TO service_role';
    PERFORM set_config('talkx.backfill_granted_public_create', '1', false);
  END IF;
END;
$do$;

ALTER FUNCTION public.backfill_talkx_template_current_version() OWNER TO service_role;

-- 4) Executa o backfill (service_role dentro; current_user do applier intacto) --
SELECT public.backfill_talkx_template_current_version();

-- 5) A funcao e de uso unico: nao deixe um SECURITY DEFINER de service_role
--    pendurado. Ela so existiu dentro desta transacao (o applier aplica a migration
--    em um unico statement), entao o drop e obrigatorio e nao ha janela exposta.
DROP FUNCTION IF EXISTS public.backfill_talkx_template_current_version();

-- 6) Restaura o ACL de public se o passo 3 concedeu CREATE ---------------------
DO $do$
BEGIN
  IF current_setting('talkx.backfill_granted_public_create', true) = '1' THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM service_role';
  END IF;
END;
$do$;

-- 7) update_talkx_template_with_snapshot passa a arquivar tambem o estado NOVO -

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
     OR p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 65536
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
