-- talkx_template_duplicate_archive_delete
-- Rollback: recria public.guard_talkx_template_update com o corpo anterior (linha executavel abaixo, copiada inteira) e dropa as 3 RPCs novas. A coluna archived_at NAO e removida pelo rollback: ela e adicionada aqui so de forma idempotente (ADD COLUMN IF NOT EXISTS), para o cartao nao depender da ordem em que o N-126a entra na branch do dia; remove-la apagaria a coluna e os dados daquele cartao. O GRANT/REVOKE some junto com o DROP FUNCTION; a funcao do guard, recriada no rollback, volta ao ACL ja revogado (re-REVOKE explicito).
-- Rollback (SQL executável, na ordem):
--   create or replace function public.guard_talkx_template_update() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $function$ BEGIN IF current_user = 'service_role'::name THEN RETURN NEW; END IF; IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.content IS NOT DISTINCT FROM OLD.content AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type AND NEW.tags IS NOT DISTINCT FROM OLD.tags AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at AND NEW.use_count = OLD.use_count + 1 THEN RETURN NEW; END IF; IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count AND EXISTS (SELECT 1 FROM public.talkx_template_versions AS history WHERE history.template_id = OLD.id AND history.created_at = statement_timestamp() AND history.saved_by = public.get_profile_id_for_user(auth.uid()) AND history.name IS NOT DISTINCT FROM OLD.name AND history.description IS NOT DISTINCT FROM OLD.description AND history.category IS NOT DISTINCT FROM OLD.category AND history.content IS NOT DISTINCT FROM OLD.content AND history.media_url IS NOT DISTINCT FROM OLD.media_url AND history.media_type IS NOT DISTINCT FROM OLD.media_type AND history.tags IS NOT DISTINCT FROM OLD.tags AND history.status IS NOT DISTINCT FROM OLD.status AND history.custom_variables IS NOT DISTINCT FROM OLD.custom_variables) THEN RETURN NEW; END IF; RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc' USING ERRCODE = '42501'; END; $function$;
--   revoke all on function public.guard_talkx_template_update() from public, anon, authenticated;
--   drop function if exists public.delete_talkx_template(uuid);
--   drop function if exists public.archive_talkx_template(uuid, boolean);
--   drop function if exists public.duplicate_talkx_template(uuid);
--
-- N-127 / Talk X: duplicar e arquivar template + trava de exclusao.
--
-- Problema: nao existia caminho de banco para (a) duplicar um template levando o
-- conteudo e as variantes A/B, (b) arquivar um template (some da lista ativa sem
-- apagar) e (c) impedir apagar um template que ja esta em campanha. A tabela
-- talkx_templates tem RLS de DELETE livre, entao o template usado em campanha era
-- apagavel (as campanhas ficavam com template_id NULL via ON DELETE SET NULL).
--
-- Correcao, so no banco, 3 RPCs SECURITY DEFINER (search_path fixo, checagem
-- explicita de quem chama, negar por padrao, EXECUTE so para authenticated):
-- 1. public.duplicate_talkx_template(p_template_id)  — copia o template como
-- rascunho proprio e copia as variantes A/B, numa unica transacao.
-- 2. public.archive_talkx_template(p_template_id, p_archived) — grava/limpa
-- archived_at (idempotente); some da lista ativa (archived_at IS NULL) sem
-- perder historico/variantes.
-- 3. public.delete_talkx_template(p_template_id) — recusa com 'talkx_template_in_use'
-- quando existe campanha apontando para o template.
--
-- O guard public.guard_talkx_template_update bloqueava QUALQUER UPDATE sem snapshot
-- autorizado, inclusive gravar archived_at — sem tocar nele o arquivamento era
-- impossivel. Ele e recriado aqui com um ramo a mais: alteracao que toca SOMENTE
-- archived_at passa; qualquer alteracao de conteudo continua exigindo o snapshot.
--
-- Fora do escopo (front): a lista ativa da tela precisa filtrar archived_at IS NULL.
-- Nao ha DDL de outra coluna, DROP, TRUNCATE nem DML em massa.

-- ============================================================================
-- 1. archived_at — marcador de arquivamento (idempotente; dono do cartao: N-126a)
-- ============================================================================
ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.talkx_templates.archived_at IS
  'N-127: quando nao nulo, o template esta arquivado e sai da lista ativa (archived_at IS NULL). Nao apaga conteudo, variantes nem historico.';

-- ============================================================================
-- 2. guard_talkx_template_update — permite mudanca que toca SOMENTE archived_at
-- (corpo anterior intacto; so um ramo novo antes do RAISE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_talkx_template_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
     AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count = OLD.use_count + 1 THEN
    RETURN NEW;
  END IF;

  -- A matching snapshot authorizes only the mutable content fields exposed by
  -- update_talkx_template_with_snapshot. Identity, ownership, creation time
  -- and usage accounting remain immutable even if another SQL path executes
  -- in the same statement.
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND EXISTS (
    SELECT 1
    FROM public.talkx_template_versions AS history
    WHERE history.template_id = OLD.id
      AND history.created_at = statement_timestamp()
      AND history.saved_by = public.get_profile_id_for_user(auth.uid())
      AND history.name IS NOT DISTINCT FROM OLD.name
      AND history.description IS NOT DISTINCT FROM OLD.description
      AND history.category IS NOT DISTINCT FROM OLD.category
      AND history.content IS NOT DISTINCT FROM OLD.content
      AND history.media_url IS NOT DISTINCT FROM OLD.media_url
      AND history.media_type IS NOT DISTINCT FROM OLD.media_type
      AND history.tags IS NOT DISTINCT FROM OLD.tags
      AND history.status IS NOT DISTINCT FROM OLD.status
      AND history.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     ) THEN
    RETURN NEW;
  END IF;

  -- N-127: arquivar/desarquivar toca SOMENTE archived_at. Metadado de estado,
  -- nao conteudo — nao exige snapshot. Todo o conteudo (nome, texto, midia,
  -- tags, categoria, status, variaveis) continua travado pelo ramo acima.
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
     AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc'
    USING ERRCODE = '42501';
END;
$function$;

-- CREATE OR REPLACE preserva a ACL, mas a funcao do guard nasce executavel por
-- PUBLIC se alguem a recriou antes; re-afirma o revoke por assinatura exata.
REVOKE ALL ON FUNCTION public.guard_talkx_template_update()
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. duplicate_talkx_template — copia conteudo e variantes numa transacao
-- ============================================================================
CREATE OR REPLACE FUNCTION public.duplicate_talkx_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_src public.talkx_templates%ROWTYPE;
  v_new_id uuid;
  v_new_name text;
  v_variants integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_src FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  -- ' (cópia)' tem 8 caracteres; o CHECK da tabela limita name a 200.
  v_new_name := left(v_src.name, 192) || ' (cópia)';

  INSERT INTO public.talkx_templates (
    name, description, category, content, media_url, media_type, tags,
    status, custom_variables, created_by
  ) VALUES (
    v_new_name, v_src.description, v_src.category, v_src.content,
    v_src.media_url, v_src.media_type, v_src.tags,
    'draft', v_src.custom_variables, v_profile_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.talkx_template_variants (
    template_id, label, content, media_url, media_type, weight
  )
  SELECT v_new_id, label, content, media_url, media_type, weight
  FROM public.talkx_template_variants
  WHERE template_id = p_template_id;
  GET DIAGNOSTICS v_variants = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', v_new_id,
    'variants_copied', v_variants
  );
END;
$function$;

-- ============================================================================
-- 4. archive_talkx_template — grava/limpa archived_at (idempotente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.archive_talkx_template(p_template_id uuid, p_archived boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT created_by INTO v_owner
  FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  IF NOT (v_owner = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Idempotente: so grava se o estado muda (nao reescreve updated_at a toa).
  UPDATE public.talkx_templates
     SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
   WHERE id = p_template_id
     AND (archived_at IS NULL) = p_archived;

  RETURN jsonb_build_object('ok', true, 'archived', p_archived);
END;
$function$;

-- ============================================================================
-- 5. delete_talkx_template — recusa apagar template usado em campanha
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_talkx_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_caller);
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT created_by INTO v_owner
  FROM public.talkx_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  IF NOT (v_owner = v_profile_id OR public.is_admin_or_supervisor(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.talkx_campaigns WHERE template_id = p_template_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'talkx_template_in_use');
  END IF;

  DELETE FROM public.talkx_templates WHERE id = p_template_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ============================================================================
-- 6. ACL — negar por padrao; EXECUTE so para authenticated
-- ============================================================================
REVOKE ALL ON FUNCTION public.duplicate_talkx_template(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_talkx_template(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_talkx_template(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.duplicate_talkx_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_talkx_template(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_talkx_template(uuid) TO authenticated;
