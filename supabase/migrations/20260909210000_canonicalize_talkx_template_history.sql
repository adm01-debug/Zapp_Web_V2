-- Canonicaliza o historico de templates Talk X que surgiu primeiro no runtime.
-- Esta migration e intencionalmente forward-only e idempotente no estado:
-- registra a DDL no ledger, reduz ACLs e serializa snapshot + update.

ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS custom_variables text[] NOT NULL DEFAULT '{}'::text[];

-- A atualizacao canonica e a criacao devem aceitar exatamente o mesmo
-- dominio. Dados legados invalidos exigem reparo explicito antes do rollout;
-- nao convertemos URL, conteudo ou classificacao silenciosamente.
DO $migration$
BEGIN
  -- Reconciliar custom_variables com digito na posicao inicial (legado do editor anterior)
  UPDATE public.talkx_templates
  SET custom_variables = ARRAY(
    SELECT CASE WHEN cv ~ '^[0-9]' THEN '_' || cv ELSE cv END
    FROM unnest(COALESCE(custom_variables, '{}'::text[])) AS cv
  )
  WHERE EXISTS (
    SELECT 1 FROM unnest(COALESCE(custom_variables, '{}'::text[])) AS cv WHERE cv ~ '^[0-9]'
  );

  IF EXISTS (
    SELECT 1
    FROM public.talkx_templates AS template
    WHERE template.name IS NULL
       OR length(btrim(template.name)) NOT BETWEEN 1 AND 200
       OR template.category IS NULL
       OR length(btrim(template.category)) NOT BETWEEN 1 AND 100
       OR template.content IS NULL
       OR length(template.content) NOT BETWEEN 1 AND 65536
       OR template.status IS NULL
       OR template.status NOT IN ('draft', 'review', 'approved')
       OR (template.description IS NOT NULL AND length(template.description) > 4000)
       OR (template.media_url IS NOT NULL AND (
         length(template.media_url) > 8192 OR template.media_url !~ '^https://'
       ))
       OR (template.media_type IS NOT NULL
           AND template.media_type NOT IN ('image', 'video', 'document', 'audio'))
       OR COALESCE(cardinality(template.tags), 0) > 50
       OR EXISTS (
         SELECT 1 FROM unnest(COALESCE(template.tags, '{}'::text[])) AS tag
         WHERE length(tag) NOT BETWEEN 1 AND 64
       )
       OR COALESCE(cardinality(template.custom_variables), 0) > 100
       OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(template.custom_variables, '{}'::text[])) AS variable
         WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
       )
       OR cardinality(ARRAY(
         SELECT DISTINCT value
         FROM unnest(COALESCE(template.custom_variables, '{}'::text[])) AS value
       )) IS DISTINCT FROM cardinality(COALESCE(template.custom_variables, '{}'::text[]))
  ) THEN
    RAISE EXCEPTION 'talkx_templates_invalid_existing_rows'
      USING ERRCODE = '23514',
            HINT = 'Repare explicitamente os templates fora do contrato antes de reaplicar a migration.';
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  description text,
  content text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  custom_variables text[] NOT NULL DEFAULT '{}'::text[],
  saved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_template_versions_template_id_version_number_key
    UNIQUE (template_id, version_number)
);

-- Reconciliacao segura para o caso em que a tabela ja exista no runtime.
ALTER TABLE public.talkx_template_versions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS version_number integer,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS custom_variables text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS saved_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT statement_timestamp();

UPDATE public.talkx_template_versions
SET tags = '{}'::text[]
WHERE tags IS NULL;

UPDATE public.talkx_template_versions
SET custom_variables = '{}'::text[]
WHERE custom_variables IS NULL;

UPDATE public.talkx_template_versions
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE public.talkx_template_versions
SET status = 'draft'
WHERE status IS NULL;

UPDATE public.talkx_template_versions
SET created_at = statement_timestamp()
WHERE created_at IS NULL;

-- template_id/version_number e o conteudo historico nao podem ser inferidos
-- sem fabricar auditoria. Pare com diagnostico deterministico antes dos
-- SET NOT NULL caso um runtime parcialmente formado contenha essas lacunas.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.talkx_template_versions
    WHERE template_id IS NULL
       OR version_number IS NULL
       OR name IS NULL
       OR content IS NULL
       OR category IS NULL
  ) THEN
    RAISE EXCEPTION 'talkx_template_history_irreconcilable_nulls'
      USING ERRCODE = '23502',
            HINT = 'Repare explicitamente template_id, version_number, name, content e category antes de reaplicar a migration.';
  END IF;
END;
$migration$;

ALTER TABLE public.talkx_template_versions
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN template_id SET NOT NULL,
  ALTER COLUMN version_number SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN tags SET DEFAULT '{}'::text[],
  ALTER COLUMN tags SET NOT NULL,
  ALTER COLUMN custom_variables SET DEFAULT '{}'::text[],
  ALTER COLUMN custom_variables SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT statement_timestamp(),
  ALTER COLUMN created_at SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_template_id_fkey'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES public.talkx_templates(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_saved_by_fkey'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_saved_by_fkey
      FOREIGN KEY (saved_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_template_id_version_number_key'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_template_id_version_number_key
      UNIQUE (template_id, version_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_version_positive'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_version_positive
      CHECK (version_number > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_status_check'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_status_check
      CHECK (status IN ('draft', 'review', 'approved')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.talkx_template_versions'::regclass
      AND conname = 'talkx_template_versions_media_type_check'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'document', 'audio'))
      NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.talkx_template_versions
  VALIDATE CONSTRAINT talkx_template_versions_version_positive;
ALTER TABLE public.talkx_template_versions
  VALIDATE CONSTRAINT talkx_template_versions_status_check;
ALTER TABLE public.talkx_template_versions
  VALIDATE CONSTRAINT talkx_template_versions_media_type_check;

CREATE INDEX IF NOT EXISTS talkx_template_versions_template_id_idx
  ON public.talkx_template_versions(template_id, version_number DESC);

ALTER TABLE public.talkx_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talkx_template_versions_select
  ON public.talkx_template_versions;
DROP POLICY IF EXISTS talkx_template_versions_insert
  ON public.talkx_template_versions;
CREATE POLICY talkx_template_versions_select
ON public.talkx_template_versions
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.talkx_templates template
    WHERE template.id = talkx_template_versions.template_id
  )
);

-- Valida INSERT e UPDATE no limite da tabela, inclusive clientes antigos que
-- ainda criam templates pelo endpoint REST. A RPC repete a validacao para
-- falhar antes do snapshot e manter um erro de dominio estavel.
CREATE OR REPLACE FUNCTION public.validate_talkx_template_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.name IS NULL OR length(btrim(NEW.name)) NOT BETWEEN 1 AND 200
     OR NEW.category IS NULL OR length(btrim(NEW.category)) NOT BETWEEN 1 AND 100
     OR NEW.content IS NULL OR length(NEW.content) NOT BETWEEN 1 AND 65536
     OR NEW.status IS NULL OR NEW.status NOT IN ('draft', 'review', 'approved')
     OR (NEW.description IS NOT NULL AND length(NEW.description) > 4000)
     OR (NEW.media_url IS NOT NULL AND (
       length(NEW.media_url) > 8192 OR NEW.media_url !~ '^https://'
     ))
     OR (NEW.media_type IS NOT NULL
         AND NEW.media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR COALESCE(cardinality(NEW.tags), 0) > 50
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(NEW.tags, '{}'::text[])) AS tag
       WHERE length(tag) NOT BETWEEN 1 AND 64
     )
     OR COALESCE(cardinality(NEW.custom_variables), 0) > 100
     OR EXISTS (
       SELECT 1
       FROM unnest(COALESCE(NEW.custom_variables, '{}'::text[])) AS variable
       WHERE variable !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$'
     )
     OR cardinality(ARRAY(
       SELECT DISTINCT value
       FROM unnest(COALESCE(NEW.custom_variables, '{}'::text[])) AS value
     )) IS DISTINCT FROM cardinality(COALESCE(NEW.custom_variables, '{}'::text[])) THEN
    RAISE EXCEPTION 'invalid_talkx_template' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_talkx_template_input
  ON public.talkx_templates;
CREATE TRIGGER trg_validate_talkx_template_input
BEFORE INSERT OR UPDATE ON public.talkx_templates
FOR EACH ROW EXECUTE FUNCTION public.validate_talkx_template_input();

REVOKE ALL ON FUNCTION public.validate_talkx_template_input()
  FROM PUBLIC, anon, authenticated;

-- O contador de uso nao representa uma revisao de conteudo e, portanto, nao
-- deve invalidar o optimistic-lock de um editor aberto. Substitui apenas o
-- trigger de updated_at desta tabela; as demais tabelas continuam usando a
-- funcao generica.
CREATE OR REPLACE FUNCTION public.set_talkx_template_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
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
     AND NEW.use_count = OLD.use_count + 1 THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := transaction_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_talkx_templates_updated_at
  ON public.talkx_templates;
CREATE TRIGGER update_talkx_templates_updated_at
BEFORE UPDATE ON public.talkx_templates
FOR EACH ROW EXECUTE FUNCTION public.set_talkx_template_updated_at();

REVOKE ALL ON FUNCTION public.set_talkx_template_updated_at()
  FROM PUBLIC, anon, authenticated;

-- Snapshot e update sao uma unica transacao. O lock da linha do template
-- serializa o MAX(version_number)+1 e o expected_updated_at evita lost update.
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

  RETURN QUERY SELECT p_template_id, v_updated_at, v_version_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) TO authenticated;

-- The usage counter is a separate atomic operation. Keeping it out of the
-- content snapshot RPC avoids noisy history while still closing direct UPDATE.
CREATE OR REPLACE FUNCTION public.increment_talkx_template_use(
  p_template_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_use_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.talkx_templates AS template
  SET use_count = template.use_count + 1
  WHERE template.id = p_template_id
  RETURNING template.use_count INTO v_use_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_use_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_talkx_template_use(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_talkx_template_use(uuid)
  TO authenticated;

-- Enforce canonical content updates at the table boundary. The content RPC
-- inserts a snapshot in the same SQL statement before updating the live row;
-- a direct table caller cannot manufacture that snapshot because history has
-- no mutation ACL and its own invoker guard. Counter-only +1 is explicitly
-- allowed, while the caller uses the atomic counter RPC to avoid lost updates.
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

  RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_talkx_template_update
  ON public.talkx_templates;
CREATE TRIGGER trg_guard_talkx_template_update
BEFORE UPDATE ON public.talkx_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_template_update();

REVOKE ALL ON FUNCTION public.guard_talkx_template_update()
  FROM PUBLIC, anon, authenticated;

-- Defesa em profundidade: mesmo que uma policy/grant permissiva seja
-- reintroduzida, clientes JWT nao fabricam nem reescrevem o historico.
CREATE OR REPLACE FUNCTION public.guard_talkx_template_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rpc_owner name;
BEGIN
  SELECT role.rolname INTO v_rpc_owner
  FROM pg_proc procedure
  JOIN pg_roles role ON role.oid = procedure.proowner
  WHERE procedure.oid = 'public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])'::regprocedure;

  -- Em um ON DELETE CASCADE o pai ja nao esta visivel. Isso preserva a
  -- exclusao canonica do template, sem permitir DELETE direto do historico
  -- enquanto o pai ainda existe.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.talkx_templates AS template
    WHERE template.id = OLD.template_id
  ) THEN
    RETURN OLD;
  END IF;

  IF current_user IS DISTINCT FROM v_rpc_owner
     AND current_user IS DISTINCT FROM 'service_role'::name THEN
    RAISE EXCEPTION 'talkx_template_history_requires_authorized_rpc'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_talkx_template_version_immutable
  ON public.talkx_template_versions;
CREATE TRIGGER trg_guard_talkx_template_version_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_template_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_template_version_immutable();

REVOKE ALL ON FUNCTION public.guard_talkx_template_version_immutable()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.talkx_template_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.talkx_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talkx_template_versions TO service_role;

COMMENT ON TABLE public.talkx_template_versions IS
  'Historico imutavel de templates Talk X; escrita somente pela RPC atomica canonica.';
