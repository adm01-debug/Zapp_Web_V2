-- contact_notes_identity_merge_bypass
-- R2-DB-016 (item 301): mesclagem autorizada de contato com nota era bloqueada pelo guard posterior de identidade das notas.
-- Rollback: reaplicar os corpos integrais das duas definicoes vivas anteriores, na ordem inversa --
--   20260909200000_harden_inbox_contact_authorization.sql (guard SEM o bypass da GUC) e
--   20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql (merge SEM o set_config). Nao cabe
--   SQL curto aqui: os corpos tem ~130 e ~120 linhas.
--
-- DEFEITO (medido no codigo atual, nao suposto):
--   public.merge_contacts_atomic(uuid, uuid[], jsonb) move TODA FK simples que aponta para
--   contacts(id) -- inclusive contact_notes.contact_id -- executando
--     UPDATE public.contact_notes SET contact_id = <primario> WHERE contact_id = ANY(<secundarios>);
--   A migracao 20260909200000 instalou o trigger guard_contact_note_identity
--   (BEFORE UPDATE OF contact_id, author_id) que rejeita QUALQUER mudanca do par, sem bypass
--   privilegiado. Resultado: um secundario com nota aborta a mesclagem INTEIRA (23514),
--   inclusive para admin/supervisor e para service_role.
--
-- CORRECAO (bypass estreito e explicito):
--   O proprio merge sinaliza a operacao com uma GUC TRANSACIONAL
--   (app.contact_merge_identity='on', set_config(..., is_local=true)) e o guard dispensa a
--   checagem SOMENTE enquanto esse sinal existe. O sinal so e escrito dentro desta funcao
--   SECURITY DEFINER, que ja exige service_role ou admin/supervisor antes de qualquer escrita.
--   O caminho PADRAO continua NEGANDO: sem o sinal -- UPDATE direto do cliente, do service_role
--   ou do proprio postgres -- o guard segue levantando 23514. Nao ha RPC que aceite nome/valor de
--   GUC vindo do chamador (conferido: todo set_config do repo usa nome e valor literais), e
--   ausencia da GUC (NULL) nao e 'on', logo o guard NEGA por padrao.
--   O sinal e resetado logo apos o loop de FKs para nao valer para o resto da transacao.
--
-- Classe: contrato (CREATE OR REPLACE de funcao de trigger + de RPC).
--
-- Rollback: reaplicar os corpos integrais das duas definicoes vivas anteriores --
--   20260909200000_harden_inbox_contact_authorization.sql (guard SEM o bypass da GUC) e
--   20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql (merge SEM o set_config).
--   Nao cabe SQL curto aqui: os corpos tem ~130 e ~120 linhas; desfazer na ordem inversa.

CREATE OR REPLACE FUNCTION public.guard_contact_note_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Sinal transacional escrito SOMENTE por public.merge_contacts_atomic: ali a reatribuicao
  -- de contact_id e a operacao autorizada de mesclagem. Sem o sinal (qualquer UPDATE direto),
  -- cai na checagem abaixo e NEGA.
  IF current_setting('app.contact_merge_identity', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (NEW.contact_id, NEW.author_id)
    IS DISTINCT FROM (OLD.contact_id, OLD.author_id) THEN
    RAISE EXCEPTION 'contact note identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_contact_note_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_contact_note_identity ON public.contact_notes;
CREATE TRIGGER guard_contact_note_identity
  BEFORE UPDATE OF contact_id, author_id
  ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_contact_note_identity();

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
  v_expected integer;
  v_locked integer;
  v_relation record;
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

  IF EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = p_primary_id)
     AND EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids)) THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_secondary_link
  FROM public.crm_contact_links
  WHERE zapp_contact_id = ANY(v_secondary_ids)
  ORDER BY zapp_contact_id
  LIMIT 1;
  IF FOUND AND (
    SELECT count(*) FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505';
  END IF;
  IF v_secondary_link.id IS NOT NULL THEN
    UPDATE public.crm_contact_links
    SET zapp_contact_id = p_primary_id, verified_at = now()
    WHERE id = v_secondary_link.id;
  END IF;

  UPDATE public.contacts
  SET
    name = CASE WHEN p_merged_fields ? 'name' THEN NULLIF(p_merged_fields->>'name', '') ELSE name END,
    surname = CASE WHEN p_merged_fields ? 'surname' THEN p_merged_fields->>'surname' ELSE surname END,
    nickname = CASE WHEN p_merged_fields ? 'nickname' THEN p_merged_fields->>'nickname' ELSE nickname END,
    phone = CASE WHEN p_merged_fields ? 'phone' THEN NULLIF(p_merged_fields->>'phone', '') ELSE phone END,
    email = CASE WHEN p_merged_fields ? 'email' THEN p_merged_fields->>'email' ELSE email END,
    company = CASE WHEN p_merged_fields ? 'company' THEN p_merged_fields->>'company' ELSE company END,
    job_title = CASE WHEN p_merged_fields ? 'job_title' THEN p_merged_fields->>'job_title' ELSE job_title END,
    contact_type = CASE WHEN p_merged_fields ? 'contact_type' THEN p_merged_fields->>'contact_type' ELSE contact_type END,
    avatar_url = CASE WHEN p_merged_fields ? 'avatar_url' THEN p_merged_fields->>'avatar_url' ELSE avatar_url END,
    tags = CASE WHEN p_merged_fields ? 'tags' THEN ARRAY(
      SELECT DISTINCT value FROM jsonb_array_elements_text(p_merged_fields->'tags') AS value
    ) ELSE tags END,
    updated_at = now()
  WHERE id = p_primary_id;

  -- Mesclagem autorizada em andamento: o loop abaixo reatribui contact_id das notas (e demais
  -- FKs) do secundario para o primario. O guard de identidade das notas aceita essa reatribuicao
  -- SOMENTE enquanto este sinal transacional estiver ligado.
  PERFORM set_config('app.contact_merge_identity', 'on', true);

  -- Move todas as FKs simples atuais e futuras que apontem para contacts(id).
  -- Unique/conflict em qualquer dependencia aborta e reverte a transacao inteira.
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
      AND rel.relname <> 'crm_contact_links'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)',
      v_relation.schema_name, v_relation.table_name,
      v_relation.column_name, v_relation.column_name
    ) USING p_primary_id, v_secondary_ids;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_moved := v_moved + v_affected;
  END LOOP;

  -- Desliga o sinal: o resto da funcao/transacao volta ao caminho padrao (nota imutavel).
  PERFORM set_config('app.contact_merge_identity', 'off', true);

  DELETE FROM public.contacts WHERE id = ANY(v_secondary_ids);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_merge_delete_failed' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'primary_id', p_primary_id,
    'merged_contacts', v_expected,
    'moved_relations', v_moved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_contacts_atomic(uuid, uuid[], jsonb) IS
  'Mescla contatos atomicamente; conflitos em vínculos ou dependências causam rollback integral.';

COMMENT ON FUNCTION public.guard_contact_note_identity() IS
  'Imutabilidade de contact_id/author_id das notas; dispensada apenas durante merge_contacts_atomic (GUC transacional app.contact_merge_identity).';
