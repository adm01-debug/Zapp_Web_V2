-- merge_contacts_preserva_dados
-- Rollback: a mesclagem volta a APAGAR o secundario e nao deixa rastro. Desfazer = reaplicar o corpo
--           anterior da RPC (20261006205100_contact_notes_identity_merge_bypass.sql) e remover o que e novo aqui.
-- Rollback (SQL executavel, na ordem):
--   DROP TABLE IF EXISTS public.contact_merge_audit;
--   DROP SEQUENCE IF EXISTS public.contact_merge_phone_tombstone_seq;
--   ALTER TABLE public.contacts DROP COLUMN IF EXISTS merged_into_id, DROP COLUMN IF EXISTS merged_at, DROP COLUMN IF EXISTS deletion_reason, DROP COLUMN IF EXISTS merged_phone;
--   -- e reaplicar o arquivo 20261006205100_contact_notes_identity_merge_bypass.sql (corpo da RPC anterior).
--
-- ESPECIALISTA: workersql (banco, migrations e RLS).
--
-- DEFEITO (medido em 20261006205100, linha ~184):
--   public.merge_contacts_atomic(uuid, uuid[], jsonb) mantinha o valor do principal e depois fazia
--   DELETE FISICO do secundario. E-mail/empresa/cargo que so o secundario tinha sumiam; a trilha
--   contact_deletion_audit gravava 'purge' sem apontar o sobrevivente; e contacts.phone (UNIQUE total,
--   NOT NULL) ficava "presa" no secundario apagado.
--
-- O QUE ESTA MIGRATION FAZ (aditiva; a assinatura da RPC NAO muda):
--   1. Colunas novas em public.contacts: merged_into_id (FK p/ o sobrevivente), merged_at,
--      deletion_reason ('merged'), merged_phone (telefone original preservado do secundario).
--   2. Campos vazios do principal preenchidos pelo secundario (COALESCE por campo da lista editavel);
--      p_merged_fields continua com prioridade.
--   3. Secundario vira SOFT-DELETE (deleted_at=now(), deletion_reason='merged', merged_into_id=principal)
--      -- NAO ha mais DELETE fisico, logo a auditoria nao grava mais 'purge' nesta operacao.
--   4. phone do secundario e liberado: o original (ja normalizado para digitos) fica em merged_phone e
--      phone recebe uma sentinela SO digitos, unica e de 21 digitos ('9'+20 digitos da sequencia),
--      porque o gatilho trg_normalize_contact_phone reduz phone a [0-9] em todo INSERT/UPDATE.
--      O ingest_inbound_message busca por variantes do telefone SEM filtrar deleted_at; como o telefone
--      real deixa de existir na linha soft-deleted, um inbound novo cria um contato NOVO vivo -- nao
--      ressuscita o mesclado. E a escolha registrada (item 2 do cartao).
--   5. Movimento sem duplicar: as FKs simples apontando para contacts(id) sao reatribuidas e, antes,
--      as linhas do secundario que colidiriam no MESMO indice unico que inclui a coluna sao removidas
--      (contact_custom_fields, contact_tags, conversation_memory, favorite_contacts, message_reactions,
--      pinned_conversations, talkx_blacklist, talkx_recipients). Durante o movimento o gatilho
--      update_*_updated_at das tabelas filhas e DESLIGADO (so ele) e reabilitado no fim: realocar o
--      contato NAO e uma edicao do registro, entao a data de atividade das linhas movidas e preservada.
--   6. Trilha append-only nova public.contact_merge_audit (sobrevivente + mesclado, sem PII). Tem
--      precedente em public.contact_deletion_audit: SEM FK de proposito, para que um expurgo fisico
--      futuro (CT-086 / t_49a0faab) possa apagar a LINHA do contato sem apagar o rastro merged_into_id.
--   7. Idempotencia: chamar de novo com o mesmo par e no-op (o secundario ja mesclado neste principal
--      nao e reprocessado). Secundario mesclado em OUTRO principal, ou soft-deleted sem ser mesclagem,
--      e recusado.
--
-- Classe: aditiva (coluna/tabela/indice novos + DML com WHERE) + CREATE OR REPLACE de RPC.
--
-- FAIL-CLOSED: a RPC so escreve em contact_merge_audit via SECURITY DEFINER; se a tabela faltar a
--   mesclagem aborta inteira (nada de mesclar sem auditar). Mesma escolha de contact_deletion_audit.
-- ---------------------------------------------------------------------------------------------

-- 1) Colunas novas em public.contacts (aditivas) -----------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS merged_phone text;

CREATE INDEX IF NOT EXISTS idx_contacts_merged_into_id
  ON public.contacts (merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- Sentinela unica para "liberar" o telefone do soft-deleted. O gatilho
-- trg_normalize_contact_phone (BEFORE INSERT OR UPDATE OF phone) reduz phone a [0-9],
-- entao a sentinela tem de ser SO digitos e unica; a sequencia garante unicidade e o
-- comprimento (>15 digitos, acima do E.164 maximo) evita casar com telefone real.
CREATE SEQUENCE IF NOT EXISTS public.contact_merge_phone_tombstone_seq;
COMMENT ON SEQUENCE public.contact_merge_phone_tombstone_seq IS
  'Sentinela de telefone para contato mesclado: phone = ''9'' || lpad(nextval,20,''0'') (21 digitos, unico, nunca casa com telefone real).';

COMMENT ON COLUMN public.contacts.merged_into_id IS
  'Contato sobrevivente em que esta linha foi mesclada (NULL = nao mesclada). O rastro durável fica em public.contact_merge_audit.';
COMMENT ON COLUMN public.contacts.merged_at IS
  'Instante em que esta linha foi mesclada (soft-delete por mesclagem).';
COMMENT ON COLUMN public.contacts.deletion_reason IS
  'Motivo do soft-delete: ''merged'' = mesclado em outro contato; NULL = exclusao normal/ativo.';
COMMENT ON COLUMN public.contacts.merged_phone IS
  'Telefone ORIGINAL preservado quando a linha foi mesclada (o phone recebe ''merged:<uuid>'' para liberar o numero).';

-- 2) Trilha append-only da mesclagem (sem FK: sobrevive ao expurgo fisico) ---------------------
CREATE TABLE IF NOT EXISTS public.contact_merge_audit (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  primary_id           uuid        NOT NULL,
  merged_id            uuid        NOT NULL,
  merged_at            timestamptz NOT NULL DEFAULT now(),
  performed_by         uuid,
  performed_by_db_role text        NOT NULL DEFAULT session_user,
  CONSTRAINT contact_merge_audit_distinct_check CHECK (primary_id <> merged_id)
);

-- RLS + ACL imediatamente apos o CREATE (tabela nasce trancada).
ALTER TABLE public.contact_merge_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contact_merge_audit FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.contact_merge_audit TO authenticated;
GRANT SELECT, INSERT ON TABLE public.contact_merge_audit TO service_role;

DROP POLICY IF EXISTS contact_merge_audit_select_admin_supervisor ON public.contact_merge_audit;
CREATE POLICY contact_merge_audit_select_admin_supervisor
ON public.contact_merge_audit FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS contact_merge_audit_block_authenticated_insert ON public.contact_merge_audit;
CREATE POLICY contact_merge_audit_block_authenticated_insert
ON public.contact_merge_audit FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS contact_merge_audit_block_authenticated_update ON public.contact_merge_audit;
CREATE POLICY contact_merge_audit_block_authenticated_update
ON public.contact_merge_audit FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS contact_merge_audit_block_authenticated_delete ON public.contact_merge_audit;
CREATE POLICY contact_merge_audit_block_authenticated_delete
ON public.contact_merge_audit FOR DELETE TO authenticated USING (false);

-- Guarda de forma: CREATE TABLE IF NOT EXISTS nao reconcilia drift.
DO $drift_guard$ DECLARE v_faltando text; BEGIN
  SELECT string_agg(esperada.nome, ', ' ORDER BY esperada.nome) INTO v_faltando
  FROM (VALUES ('id'),('primary_id'),('merged_id'),('merged_at'),('performed_by'),('performed_by_db_role')) AS esperada(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_merge_audit'
      AND a.attname = esperada.nome AND a.attnum > 0 AND NOT a.attisdropped
  );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'public.contact_merge_audit tem forma divergente (drift): coluna(s) ausente(s): %.', v_faltando;
  END IF;
END
$drift_guard$;

CREATE INDEX IF NOT EXISTS idx_contact_merge_audit_primary
  ON public.contact_merge_audit (primary_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_merge_audit_merged
  ON public.contact_merge_audit (merged_id);

COMMENT ON TABLE public.contact_merge_audit IS
  'Trilha append-only de mesclagem de contatos: qual sobrevivente (primary_id) absorveu qual contato (merged_id). Sem FK para sobreviver ao expurgo fisico. Escrita so pela RPC SECURITY DEFINER; leitura so admin/supervisor.';
COMMENT ON COLUMN public.contact_merge_audit.performed_by IS
  'auth.uid() (claim sub) do chamador quando houver sessao; NULL em chamada service_role sem JWT. A autoria sempre existe em performed_by_db_role.';
COMMENT ON COLUMN public.contact_merge_audit.performed_by_db_role IS
  'session_user da conexao que executou a mesclagem (sempre preenchido).';

-- 3) RPC: preserva dados do secundario, soft-delete com rastro e movimento sem duplicar ---------
CREATE OR REPLACE FUNCTION public.merge_contacts_atomic(
  p_primary_id uuid,
  p_secondary_ids uuid[],
  p_merged_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_secondary_ids uuid[];
  v_active_ids uuid[];
  v_expected integer;
  v_locked integer;
  v_already integer := 0;
  v_relation record;
  v_uq record;
  v_trg record;
  -- Triggers de updated_at desligados durante a realocacao (so eles), para nao reescrever a
  -- data de atividade de linhas apenas movidas de contato. Guarda 'schema|tabela|trigger'.
  v_disabled text[] := ARRAY[]::text[];
  v_key text;
  v_moved bigint := 0;
  v_affected bigint;
  v_secondary_link public.crm_contact_links%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT id ORDER BY id), count(DISTINCT id)
  INTO v_secondary_ids, v_expected
  FROM unnest(COALESCE(p_secondary_ids, ARRAY[]::uuid[])) AS ids(id)
  WHERE id IS NOT NULL AND id <> p_primary_id;

  IF p_primary_id IS NULL OR v_expected IS NULL OR v_expected < 1 OR v_expected > 50 THEN
    RAISE EXCEPTION 'invalid_contact_merge_set' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_merged_fields, '{}'::jsonb)) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(COALESCE(p_merged_fields, '{}'::jsonb)) AS key
       WHERE key NOT IN ('name','surname','nickname','phone','email','company','job_title','contact_type','avatar_url','tags')
     ) THEN
    RAISE EXCEPTION 'invalid_contact_merge_fields' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.contacts
  WHERE id = p_primary_id OR id = ANY(v_secondary_ids)
  ORDER BY id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> v_expected + 1 THEN
    RAISE EXCEPTION 'contact_merge_target_missing' USING ERRCODE = 'P0002';
  END IF;

  -- Principal tem de estar vivo.
  IF EXISTS (SELECT 1 FROM public.contacts WHERE id = p_primary_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'contact_merge_primary_not_active' USING ERRCODE = '22023';
  END IF;
  -- Secundario mesclado em OUTRO principal, ou soft-deleted fora desta mesclagem: recusa.
  IF EXISTS (
       SELECT 1 FROM public.contacts
       WHERE id = ANY(v_secondary_ids)
         AND deleted_at IS NOT NULL
         AND merged_into_id IS DISTINCT FROM p_primary_id
     ) THEN
    RAISE EXCEPTION 'contact_merge_secondary_not_active' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia: secundario ja mesclado NESTE principal nao e reprocessado.
  SELECT count(*) INTO v_already
  FROM public.contacts
  WHERE id = ANY(v_secondary_ids) AND merged_into_id = p_primary_id;

  SELECT array_agg(id ORDER BY id) INTO v_active_ids
  FROM public.contacts
  WHERE id = ANY(v_secondary_ids) AND merged_into_id IS DISTINCT FROM p_primary_id;

  IF v_active_ids IS NULL THEN
    RETURN jsonb_build_object(
      'primary_id', p_primary_id,
      'merged_contacts', 0,
      'already_merged', v_already,
      'moved_relations', 0
    );
  END IF;

  -- Vinculo CRM: no maximo um link entre principal e secundarios; move o do secundario.
  IF EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = p_primary_id)
     AND EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_active_ids)) THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_secondary_link
  FROM public.crm_contact_links
  WHERE zapp_contact_id = ANY(v_active_ids)
  ORDER BY zapp_contact_id
  LIMIT 1;
  IF FOUND AND (
    SELECT count(*) FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_active_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  IF v_secondary_link.id IS NOT NULL THEN
    UPDATE public.crm_contact_links
    SET zapp_contact_id = p_primary_id, verified_at = now()
    WHERE id = v_secondary_link.id;
  END IF;

  -- Preenche campos vazios do principal com o do secundario (COALESCE por campo); p_merged_fields vence.
  UPDATE public.contacts
  SET
    name = CASE WHEN p_merged_fields ? 'name' THEN NULLIF(p_merged_fields->>'name', '')
                ELSE COALESCE(NULLIF(btrim(name), ''),
                  (SELECT NULLIF(btrim(s.name), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.name), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    surname = CASE WHEN p_merged_fields ? 'surname' THEN p_merged_fields->>'surname'
                ELSE COALESCE(NULLIF(btrim(surname), ''),
                  (SELECT NULLIF(btrim(s.surname), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.surname), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    nickname = CASE WHEN p_merged_fields ? 'nickname' THEN p_merged_fields->>'nickname'
                ELSE COALESCE(NULLIF(btrim(nickname), ''),
                  (SELECT NULLIF(btrim(s.nickname), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.nickname), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    phone = CASE WHEN p_merged_fields ? 'phone' THEN NULLIF(p_merged_fields->>'phone', '')
                ELSE phone END,
    email = CASE WHEN p_merged_fields ? 'email' THEN p_merged_fields->>'email'
                ELSE COALESCE(NULLIF(btrim(email), ''),
                  (SELECT NULLIF(btrim(s.email), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.email), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    company = CASE WHEN p_merged_fields ? 'company' THEN p_merged_fields->>'company'
                ELSE COALESCE(NULLIF(btrim(company), ''),
                  (SELECT NULLIF(btrim(s.company), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.company), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    job_title = CASE WHEN p_merged_fields ? 'job_title' THEN p_merged_fields->>'job_title'
                ELSE COALESCE(NULLIF(btrim(job_title), ''),
                  (SELECT NULLIF(btrim(s.job_title), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.job_title), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    contact_type = CASE WHEN p_merged_fields ? 'contact_type' THEN p_merged_fields->>'contact_type'
                ELSE COALESCE(NULLIF(btrim(contact_type), ''),
                  (SELECT NULLIF(btrim(s.contact_type), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.contact_type), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    avatar_url = CASE WHEN p_merged_fields ? 'avatar_url' THEN p_merged_fields->>'avatar_url'
                ELSE COALESCE(NULLIF(btrim(avatar_url), ''),
                  (SELECT NULLIF(btrim(s.avatar_url), '') FROM public.contacts s
                   WHERE s.id = ANY(v_active_ids) AND NULLIF(btrim(s.avatar_url), '') IS NOT NULL
                   ORDER BY s.id LIMIT 1)) END,
    tags = CASE WHEN p_merged_fields ? 'tags' THEN ARRAY(
             SELECT DISTINCT value FROM jsonb_array_elements_text(p_merged_fields->'tags') AS value
           )
           ELSE COALESCE(NULLIF(tags, ARRAY[]::text[]),
             (SELECT s.tags FROM public.contacts s
              WHERE s.id = ANY(v_active_ids) AND s.tags IS NOT NULL AND cardinality(s.tags) > 0
              ORDER BY s.id LIMIT 1)) END,
    updated_at = now()
  WHERE id = p_primary_id;

  -- Mesclagem autorizada: o loop abaixo reatribui contact_id das notas; o guard aceita SOMENTE com o sinal.
  PERFORM set_config('app.contact_merge_identity', 'on', true);

  FOR v_relation IN
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.contacts'::regclass
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND ns.nspname = 'public'
      -- contacts fica de fora: o unico FK proprio e merged_into_id (trilha), que nao se move.
      AND rel.relname NOT IN ('crm_contact_links', 'contacts')
  LOOP
    -- Desliga SO o gatilho de updated_at desta tabela filha: realocar o contato NAO e uma edicao do
    -- registro; sem isto o gatilho regrava updated_at em TODAS as linhas movidas (efeito colateral
    -- real apontado pela recusa de 06/10). E reabilitado no fim da funcao.
    FOR v_trg IN
      SELECT t.tgname
      FROM pg_trigger t
      WHERE t.tgrelid = (v_relation.schema_name || '.' || v_relation.table_name)::regclass
        AND NOT t.tgisinternal
        AND t.tgfoid = 'public.update_updated_at_column()'::regprocedure
    LOOP
      EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I',
        v_relation.schema_name, v_relation.table_name, v_trg.tgname);
      v_disabled := v_disabled
        || (v_relation.schema_name || '|' || v_relation.table_name || '|' || v_trg.tgname);
    END LOOP;

    -- Sem duplicar: apaga no secundario as linhas que ja existem no principal sob o MESMO
    -- indice unico que inclui a coluna de FK (ex.: favorite_contacts, contact_tags, conversation_memory).
    FOR v_uq IN
      SELECT ARRAY(
               SELECT a.attname
               FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
               WHERE k.attnum > 0 AND a.attname <> v_relation.column_name
               ORDER BY k.ord
             ) AS other_cols
      FROM pg_index i
      WHERE i.indrelid = (v_relation.schema_name || '.' || v_relation.table_name)::regclass
        AND i.indisunique
        AND i.indpred IS NULL
        AND EXISTS (
          SELECT 1 FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          WHERE k.attnum > 0 AND a.attname = v_relation.column_name
        )
    LOOP
      IF cardinality(v_uq.other_cols) = 0 THEN
        EXECUTE format(
          'DELETE FROM %I.%I c WHERE c.%I = ANY($1) AND EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = $2)',
          v_relation.schema_name, v_relation.table_name, v_relation.column_name,
          v_relation.schema_name, v_relation.table_name, v_relation.column_name
        ) USING v_active_ids, p_primary_id;
      ELSE
        EXECUTE format(
          'DELETE FROM %I.%I c WHERE c.%I = ANY($1) AND EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = $2 AND %s)',
          v_relation.schema_name, v_relation.table_name, v_relation.column_name,
          v_relation.schema_name, v_relation.table_name, v_relation.column_name,
          (SELECT string_agg(format('p.%I IS NOT DISTINCT FROM c.%I', oc, oc), ' AND ')
           FROM unnest(v_uq.other_cols) AS oc)
        ) USING v_active_ids, p_primary_id;
      END IF;
    END LOOP;

    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)',
      v_relation.schema_name, v_relation.table_name,
      v_relation.column_name, v_relation.column_name
    ) USING p_primary_id, v_active_ids;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_moved := v_moved + v_affected;
  END LOOP;

  -- Reabilita os gatilhos de updated_at desligados. Se algo falhar, o rollback da transacao tambem
  -- desfaz o DISABLE, mantendo a tabela protegida em qualquer caminho.
  FOREACH v_key IN ARRAY v_disabled LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER %I',
      split_part(v_key, '|', 1), split_part(v_key, '|', 2), split_part(v_key, '|', 3));
  END LOOP;

  PERFORM set_config('app.contact_merge_identity', 'off', true);

  -- Soft-delete do secundario com rastro: NAO ha mais DELETE fisico (nao grava mais 'purge').
  -- phone original vai para merged_phone; phone recebe sentinela unica para liberar o numero.
  UPDATE public.contacts
  SET deleted_at = now(),
      deletion_reason = 'merged',
      merged_into_id = p_primary_id,
      merged_at = now(),
      merged_phone = COALESCE(merged_phone, phone),
      phone = '9' || lpad(nextval('public.contact_merge_phone_tombstone_seq')::text, 20, '0'),
      updated_at = now()
  WHERE id = ANY(v_active_ids);
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> cardinality(v_active_ids) THEN
    RAISE EXCEPTION 'contact_merge_softdelete_failed' USING ERRCODE = 'P0002';
  END IF;

  -- Trilha duravel (sobrevive ao expurgo fisico futuro): sobrevivente + cada mesclado.
  INSERT INTO public.contact_merge_audit (primary_id, merged_id, performed_by)
  SELECT p_primary_id, m, auth.uid() FROM unnest(v_active_ids) AS m;

  RETURN jsonb_build_object(
    'primary_id', p_primary_id,
    'merged_contacts', cardinality(v_active_ids),
    'already_merged', v_already,
    'moved_relations', v_moved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) IS
  'Mescla contatos atomicamente preservando os dados do secundario: preenche campos vazios do principal, faz soft-delete do secundario (deleted_at/deletion_reason=merged/merged_into_id) e move as FKs sem duplicar. Idempotente para o mesmo par. Grava rastro em contact_merge_audit.';
