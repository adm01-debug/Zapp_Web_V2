CREATE OR REPLACE FUNCTION public.merge_contacts_atomic(p_primary_id uuid, p_secondary_ids uuid[], p_merged_fields jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
