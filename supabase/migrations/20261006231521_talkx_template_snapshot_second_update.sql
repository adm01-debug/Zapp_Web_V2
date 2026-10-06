-- talkx_template_snapshot_second_update
-- Rollback: CREATE OR REPLACE FUNCTION public.update_talkx_template_with_snapshot(
--   p_template_id uuid,
--   p_expected_updated_at timestamptz,
--   p_name text,
--   p_description text,
--   p_category text,
--   p_content text,
--   p_media_url text,
--   p_media_type text,
--   p_tags text[],
--   p_status text,
--   p_custom_variables text[]
-- ) RETURNS TABLE(template_id uuid, updated_at timestamptz, version_number integer)
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $function$
-- DECLARE
--   v_actor_profile_id uuid;
--   v_template public.talkx_templates%ROWTYPE;
--   v_version_number integer;
--   v_current_version_id uuid;
--   v_current_version_number integer;
--   v_updated_at timestamptz := statement_timestamp();
-- BEGIN
--   IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
--     RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
--   END IF;
-- 
--   v_actor_profile_id := public.get_profile_id_for_user(auth.uid());
--   IF v_actor_profile_id IS NULL THEN
--     RAISE EXCEPTION 'authenticated_profile_not_found' USING ERRCODE = '42501';
--   END IF;
-- 
--   SELECT * INTO v_template
--   FROM public.talkx_templates template
--   WHERE template.id = p_template_id
--   FOR UPDATE;
-- 
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
--   END IF;
-- 
--   IF v_template.created_by IS DISTINCT FROM v_actor_profile_id
--      AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
--     RAISE EXCEPTION 'talkx_template_not_authorized' USING ERRCODE = '42501';
--   END IF;
-- 
--   IF p_expected_updated_at IS NULL
--      OR v_template.updated_at IS DISTINCT FROM p_expected_updated_at THEN
--     RAISE EXCEPTION 'talkx_template_stale_version' USING ERRCODE = '40001';
--   END IF;
-- 
--   IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
--      OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
--      OR p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 65536
--      OR p_status IS NULL
--      OR p_status NOT IN ('draft', 'review', 'approved')
--      OR (p_description IS NOT NULL AND length(p_description) > 4000)
--      OR (p_media_url IS NOT NULL AND (
--        length(p_media_url) > 8192 OR p_media_url !~ '^https://'
--      ))
--      OR (p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video', 'document', 'audio'))
--      OR COALESCE(cardinality(p_tags), 0) > 50
--      OR EXISTS (
--        SELECT 1 FROM unnest(COALESCE(p_tags, '{}'::text[])) tag
--        WHERE length(tag) NOT BETWEEN 1 AND 64
--      )
--      OR COALESCE(cardinality(p_custom_variables), 0) > 100
--      OR EXISTS (
--        SELECT 1 FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) variable
--        WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
--      )
--      OR cardinality(ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_custom_variables, '{}'::text[])) value))
--         IS DISTINCT FROM cardinality(COALESCE(p_custom_variables, '{}'::text[])) THEN
--     RAISE EXCEPTION 'invalid_talkx_template' USING ERRCODE = '22023';
--   END IF;
-- 
--   SELECT COALESCE(max(history.version_number), 0) + 1
--   INTO v_version_number
--   FROM public.talkx_template_versions history
--   WHERE history.template_id = p_template_id;
-- 
--   INSERT INTO public.talkx_template_versions (
--     template_id, version_number, name, description, content, category, status,
--     media_url, media_type, tags, custom_variables, saved_by, created_at
--   ) VALUES (
--     v_template.id, v_version_number, v_template.name, v_template.description,
--     v_template.content, v_template.category, v_template.status, v_template.media_url,
--     v_template.media_type, COALESCE(v_template.tags, '{}'::text[]),
--     COALESCE(v_template.custom_variables, '{}'::text[]),
--     v_actor_profile_id, v_updated_at
--   );
-- 
--   UPDATE public.talkx_templates template
--   SET name = btrim(p_name),
--       description = p_description,
--       category = btrim(p_category),
--       content = p_content,
--       media_url = p_media_url,
--       media_type = p_media_type,
--       tags = COALESCE(p_tags, '{}'::text[]),
--       status = p_status,
--       custom_variables = COALESCE(p_custom_variables, '{}'::text[]),
--       updated_at = v_updated_at
--   WHERE template.id = p_template_id
--   -- The pre-existing updated_at trigger may use transaction_timestamp().
--   -- Return the value actually persisted, never the pre-trigger candidate.
--   RETURNING template.updated_at INTO v_updated_at;
-- 
--   -- Arq(te)iva o estado NOVO (o conteudo que acabou de ficar vivo) e aponta
--   -- current_version_id para ele. Antes disso, a unica linha arquivada era o
--   -- estado ANTERIOR, entao nenhuma versao correspondia ao conteudo vivo.
--   INSERT INTO public.talkx_template_versions (
--     template_id, version_number, name, description, content, category, status,
--     media_url, media_type, tags, custom_variables, saved_by, created_at
--   ) VALUES (
--     p_template_id, v_version_number + 1, btrim(p_name), p_description,
--     p_content, btrim(p_category), p_status, p_media_url, p_media_type,
--     COALESCE(p_tags, '{}'::text[]), COALESCE(p_custom_variables, '{}'::text[]),
--     v_actor_profile_id, v_updated_at
--   )
--   -- RETURNING qualificado: RETURNS TABLE declara "version_number" como variavel
--   -- PL/pgSQL e a coluna de talkx_template_versions tem o mesmo nome — sem o
--   -- prefixo, toda chamada levanta 42702 (column reference is ambiguous).
--   RETURNING public.talkx_template_versions.id, public.talkx_template_versions.version_number
--   INTO v_current_version_id, v_current_version_number;
-- 
--   UPDATE public.talkx_templates template
--   SET current_version_id = v_current_version_id
--   WHERE template.id = p_template_id;
-- 
--   -- Devolve a versao do conteudo VIVO (arquivada acima), nao a anterior.
--   RETURN QUERY SELECT p_template_id, v_updated_at, v_current_version_number;
-- END;
-- $function$;
-- versao 20261006231521 (reservada por hermes-db-migrar) — AUTO-CONTIDA.
--
-- R2-DB-013 / item 298 (P2, area migrations). Substitui SOMENTE o corpo de
-- public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])
-- (ultima versao em supabase/migrations/20261001381230_talkx_current_version_backfill_fix.sql).
-- Nenhum GRANT, policy, trigger, tabela ou dado e alterado: o CREATE OR REPLACE
-- com a MESMA assinatura preserva owner e ACL da funcao.
--
-- O rollback abaixo restaura EXATAMENTE o corpo anterior (SQL executavel).

-- update_talkx_template_with_snapshot: o snapshot do estado NOVO grava com o
-- MESMO carimbo que o guard de talkx_templates casa (statement_timestamp()).
--
-- DEFEITO (R2-DB-013, item 298): a RPC arquiva o estado novo com o updated_at
-- DEVOLVIDO pelo primeiro UPDATE. Quando a coluna updated_at e reescrita pelo
-- trigger set_talkx_template_updated_at (20260909210000), esse valor e
-- transaction_timestamp(), que difere do statement_timestamp() usado por
-- public.guard_talkx_template_update() para casar o snapshot. Assim o SEGUNDO
-- UPDATE (SET current_version_id) nao encontra snapshot algum com
-- created_at = statement_timestamp() e e recusado com 42501
-- talkx_template_update_requires_authorized_rpc: a edicao do template falha
-- depois de ja ter arquivado as versoes.
--
-- CORRECAO: os dois snapshots (estado ANTERIOR e estado NOVO) passam a gravar
-- created_at = statement_timestamp() (v_statement_at) — o carimbo que o guard
-- exige. O updated_at persistido continua sendo o valor REAL devolvido pelo
-- RETURNING (v_updated_at), que e o que a RPC retorna para o optimistic-lock do
-- cliente; os dois conceitos deixam de ser a mesma variavel.
--
-- Semanticamente, created_at da versao viva continua sendo "agora" (o
-- statement_timestamp() da chamada); nada de historico e reescrito.

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
  -- Carimbo que o guard de snapshot casa (statement_timestamp()). E o mesmo em
  -- toda a chamada: os dois snapshots e as duas checagens do guard usam este
  -- valor. NAO confundir com transaction_timestamp(), que o trigger de
  -- updated_at pode gravar na linha viva.
  v_statement_at timestamptz := statement_timestamp();
  -- Valor efetivamente persistido em talkx_templates.updated_at (pos-trigger),
  -- devolvido ao cliente para o optimistic-lock.
  v_updated_at timestamptz;
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
    v_actor_profile_id, v_statement_at
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
      updated_at = v_statement_at
  WHERE template.id = p_template_id
  -- The pre-existing updated_at trigger may use transaction_timestamp().
  -- Return the value actually persisted, never the pre-trigger candidate.
  RETURNING template.updated_at INTO v_updated_at;

  -- Arq(te)iva o estado NOVO (o conteudo que acabou de ficar vivo) e aponta
  -- current_version_id para ele. O created_at usa v_statement_at: e o carimbo
  -- que guard_talkx_template_update() casa no segundo UPDATE abaixo; usar o
  -- updated_at persistido (transaction_timestamp) faz o guard recusar a RPC.
  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at
  ) VALUES (
    p_template_id, v_version_number + 1, btrim(p_name), p_description,
    p_content, btrim(p_category), p_status, p_media_url, p_media_type,
    COALESCE(p_tags, '{}'::text[]), COALESCE(p_custom_variables, '{}'::text[]),
    v_actor_profile_id, v_statement_at
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
