-- remove_tags
-- Rollback: recria contacts.tags (text[] default '{}') e devolve as tags arquivadas aos contatos, o indice idx_contacts_tags_gin, a tabela ai_conversation_tags (RLS, 5 policies, 2 indices, grants), as seis RPCs de etiqueta, search_contacts com tag_filter e a coluna tags no retorno, e devolve o campo 'tags' a merge_contacts_atomic, talkx_resolve_audience e talkx_audience_query; por ultimo dropa a tabela de arquivo.
-- Rollback (SQL executável, na ordem):
--   alter table public.contacts add column if not exists tags text[] default '{}'::text[];
--   update public.contacts c set tags = a.tags from public.arquivo_contacts_tags_20261012 a where a.contact_id = c.id;
--   create index if not exists idx_contacts_tags_gin on public.contacts using gin (tags);
--   create table public.ai_conversation_tags (id uuid default gen_random_uuid() not null, contact_id uuid not null, tag_name text not null, confidence numeric default 0.0, source text default 'ai'::text, created_at timestamp with time zone default now(), constraint ai_conversation_tags_pkey primary key (id), constraint ai_conversation_tags_contact_id_fkey foreign key (contact_id) references public.contacts(id), constraint ai_conversation_tags_source_known check (source is null or source = any (array['ai','human','manual'])));
--   alter table public.ai_conversation_tags enable row level security;
--   create index idx_ai_conversation_tags_contact_id on public.ai_conversation_tags using btree (contact_id);
--   create unique index ai_conversation_tags_contact_tag_uidx on public.ai_conversation_tags using btree (contact_id, tag_name);
--   create policy "Admins can delete ai tags" on public.ai_conversation_tags as permissive for delete to authenticated using (is_admin_or_supervisor(auth.uid()));
--   create policy "Admins can update ai tags" on public.ai_conversation_tags as permissive for update to authenticated using (is_admin_or_supervisor(auth.uid()));
--   create policy "Agents can delete tags on assigned contacts" on public.ai_conversation_tags as permissive for delete to authenticated using ((EXISTS ( SELECT 1 FROM (contacts c JOIN profiles p ON ((p.id = c.assigned_to))) WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = auth.uid())))) OR is_admin_or_supervisor(auth.uid()));
--   create policy "Authenticated can view ai tags" on public.ai_conversation_tags as permissive for select to authenticated using (is_contact_visible_to_user(contact_id, auth.uid()));
--   create policy "Users can insert ai tags for assigned contacts" on public.ai_conversation_tags as permissive for insert to authenticated with check ((contact_id IN ( SELECT c.id FROM contacts c WHERE (c.assigned_to IN ( SELECT profiles.id FROM profiles WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()));
--   grant select, insert, update, delete, truncate, references, trigger, maintain on table public.ai_conversation_tags to anon, authenticated, service_role;
--   drop function if exists public.search_contacts(text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean);
--   CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0, include_legacy boolean DEFAULT false) RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_search text; BEGIN v_search := NULLIF(TRIM(search_term), ''); RETURN QUERY SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at, c.latitude, c.longitude, c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code, COUNT(*) OVER () AS total_count FROM public.contacts c WHERE c.deleted_at IS NULL AND (include_legacy OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$')) AND (v_search IS NULL OR ( c.name ILIKE '%' || v_search || '%' OR c.nickname ILIKE '%' || v_search || '%' OR c.surname ILIKE '%' || v_search || '%' OR c.phone ILIKE '%' || v_search || '%' OR c.email ILIKE '%' || v_search || '%' OR c.company ILIKE '%' || v_search || '%' OR c.job_title ILIKE '%' || v_search || '%' )) AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter) AND (company_filter IS NULL OR c.company = company_filter) AND (job_title_filter IS NULL OR c.job_title = job_title_filter) AND (tag_filter IS NULL OR tag_filter = ANY(c.tags)) AND (date_from IS NULL OR c.created_at >= date_from) AND public.can_edit_contact(c.assigned_to, c.queue_id, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v), (SELECT public.get_profile_id_for_user(auth.uid())), (SELECT public.is_admin_or_supervisor(auth.uid()))) ORDER BY CASE WHEN sort_field='name' AND sort_direction='asc' THEN c.name END ASC NULLS LAST, CASE WHEN sort_field='name' AND sort_direction='desc' THEN c.name END DESC NULLS LAST, CASE WHEN sort_field='created_at' AND sort_direction='asc' THEN c.created_at END ASC NULLS LAST, CASE WHEN sort_field='created_at' AND sort_direction='desc' THEN c.created_at END DESC NULLS LAST, CASE WHEN sort_field='updated_at' AND sort_direction='asc' THEN c.updated_at END ASC NULLS LAST, CASE WHEN sort_field='updated_at' AND sort_direction='desc' THEN c.updated_at END DESC NULLS LAST, c.name ASC NULLS LAST, c.id ASC LIMIT page_size OFFSET page_offset; END; $function$;
--   revoke all on function public.search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean) from public, anon;
--   grant execute on function public.search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean) to authenticated, service_role, postgres;
--   CREATE OR REPLACE FUNCTION public.replace_ai_conversation_tags(p_contact_id uuid, p_tags jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$ declare v_count integer; begin if p_contact_id is null then raise exception 'p_contact_id é obrigatório' using errcode = '22023'; end if; delete from public.ai_conversation_tags where contact_id = p_contact_id and source = 'ai'; insert into public.ai_conversation_tags (contact_id, tag_name, confidence, source) select p_contact_id, t.tag_name, max(t.confidence), 'ai' from ( select btrim(coalesce(e ->> 'name', '')) as tag_name, case when nullif(btrim(coalesce(e ->> 'confidence', '')), '') is null then null else least(greatest(nullif(btrim(coalesce(e ->> 'confidence', '')), '')::numeric, 0), 1) end as confidence from jsonb_array_elements( case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end ) as e ) t where t.tag_name <> '' group by t.tag_name on conflict (contact_id, tag_name) do update set confidence = greatest( coalesce(excluded.confidence, public.ai_conversation_tags.confidence), coalesce(public.ai_conversation_tags.confidence, excluded.confidence) ), source = 'ai'; select count(*) into v_count from public.ai_conversation_tags where contact_id = p_contact_id and source = 'ai'; return jsonb_build_object('contact_id', p_contact_id, 'replaced', true, 'count', v_count); end; $function$;
--   CREATE OR REPLACE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_edit_permission(p_contact_id); UPDATE public.contacts SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%') || ARRAY[p_tag], updated_at = now() WHERE id = p_contact_id AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]); END; $function$;
--   CREATE OR REPLACE FUNCTION public.remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_edit_permission(p_contact_id); UPDATE public.contacts SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now() WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%'); END; $function$;
--   CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_connection_id uuid, p_label_prefix text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_global_admin(); UPDATE public.contacts SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now() WHERE whatsapp_connection_id = p_connection_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%'); END; $function$;
--   CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_connection_id uuid, p_label_prefix text, p_new_tag text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ BEGIN IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.require_contact_global_admin(); UPDATE public.contacts SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t), updated_at = now() WHERE whatsapp_connection_id = p_connection_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%'); END; $function$;
--   CREATE OR REPLACE FUNCTION public.talkx_segment_tags(p_segment uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$ SELECT COALESCE( jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb ) FROM ( SELECT tag, COUNT(DISTINCT c.id) AS cnt FROM public.talkx_campaigns tc JOIN public.talkx_recipients r ON r.campaign_id = tc.id JOIN public.contacts c ON c.id = r.contact_id CROSS JOIN LATERAL unnest(c.tags) AS tag WHERE tc.segment_id = p_segment AND c.tags IS NOT NULL GROUP BY tag ORDER BY cnt DESC LIMIT 10 ) top; $function$;
--   CREATE OR REPLACE FUNCTION public.merge_contacts_atomic(p_primary_id uuid, p_secondary_ids uuid[], p_merged_fields jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_secondary_ids uuid[]; v_expected integer; v_locked integer; v_relation record; v_moved bigint := 0; v_affected bigint; v_secondary_link public.crm_contact_links%ROWTYPE; BEGIN IF COALESCE(auth.role(), '') <> 'service_role' AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF; SELECT array_agg(DISTINCT id ORDER BY id), count(DISTINCT id) INTO v_secondary_ids, v_expected FROM unnest(COALESCE(p_secondary_ids, ARRAY[]::uuid[])) AS ids(id) WHERE id IS NOT NULL AND id <> p_primary_id; IF p_primary_id IS NULL OR v_expected IS NULL OR v_expected < 1 OR v_expected > 50 THEN RAISE EXCEPTION 'invalid_contact_merge_set' USING ERRCODE = '22023'; END IF; IF jsonb_typeof(COALESCE(p_merged_fields, '{}'::jsonb)) <> 'object' OR EXISTS ( SELECT 1 FROM jsonb_object_keys(COALESCE(p_merged_fields, '{}'::jsonb)) AS key WHERE key NOT IN ('name','surname','nickname','phone','email','company','job_title','contact_type','avatar_url','tags') ) THEN RAISE EXCEPTION 'invalid_contact_merge_fields' USING ERRCODE = '22023'; END IF; PERFORM 1 FROM public.contacts WHERE id = p_primary_id OR id = ANY(v_secondary_ids) ORDER BY id FOR UPDATE; GET DIAGNOSTICS v_locked = ROW_COUNT; IF v_locked <> v_expected + 1 THEN RAISE EXCEPTION 'contact_merge_target_missing' USING ERRCODE = 'P0002'; END IF; IF EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = p_primary_id) AND EXISTS (SELECT 1 FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids)) THEN RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505'; END IF; SELECT * INTO v_secondary_link FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids) ORDER BY zapp_contact_id LIMIT 1; IF FOUND AND ( SELECT count(*) FROM public.crm_contact_links WHERE zapp_contact_id = ANY(v_secondary_ids) ) > 1 THEN RAISE EXCEPTION 'crm_contact_link_conflict' USING ERRCODE = '23505'; END IF; IF v_secondary_link.id IS NOT NULL THEN UPDATE public.crm_contact_links SET zapp_contact_id = p_primary_id, verified_at = now() WHERE id = v_secondary_link.id; END IF; UPDATE public.contacts SET name = CASE WHEN p_merged_fields ? 'name' THEN NULLIF(p_merged_fields->>'name', '') ELSE name END, surname = CASE WHEN p_merged_fields ? 'surname' THEN p_merged_fields->>'surname' ELSE surname END, nickname = CASE WHEN p_merged_fields ? 'nickname' THEN p_merged_fields->>'nickname' ELSE nickname END, phone = CASE WHEN p_merged_fields ? 'phone' THEN NULLIF(p_merged_fields->>'phone', '') ELSE phone END, email = CASE WHEN p_merged_fields ? 'email' THEN p_merged_fields->>'email' ELSE email END, company = CASE WHEN p_merged_fields ? 'company' THEN p_merged_fields->>'company' ELSE company END, job_title = CASE WHEN p_merged_fields ? 'job_title' THEN p_merged_fields->>'job_title' ELSE job_title END, contact_type = CASE WHEN p_merged_fields ? 'contact_type' THEN p_merged_fields->>'contact_type' ELSE contact_type END, avatar_url = CASE WHEN p_merged_fields ? 'avatar_url' THEN p_merged_fields->>'avatar_url' ELSE avatar_url END, tags = CASE WHEN p_merged_fields ? 'tags' THEN ARRAY( SELECT DISTINCT value FROM jsonb_array_elements_text(p_merged_fields->'tags') AS value ) ELSE tags END, updated_at = now() WHERE id = p_primary_id; PERFORM set_config('app.contact_merge_identity', 'on', true); FOR v_relation IN SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1] WHERE con.contype = 'f' AND con.confrelid = 'public.contacts'::regclass AND array_length(con.conkey, 1) = 1 AND array_length(con.confkey, 1) = 1 AND ns.nspname = 'public' AND rel.relname <> 'crm_contact_links' LOOP EXECUTE format( 'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)', v_relation.schema_name, v_relation.table_name, v_relation.column_name, v_relation.column_name ) USING p_primary_id, v_secondary_ids; GET DIAGNOSTICS v_affected = ROW_COUNT; v_moved := v_moved + v_affected; END LOOP; PERFORM set_config('app.contact_merge_identity', 'off', true); DELETE FROM public.contacts WHERE id = ANY(v_secondary_ids); IF NOT FOUND THEN RAISE EXCEPTION 'contact_merge_delete_failed' USING ERRCODE = 'P0002'; END IF; RETURN jsonb_build_object( 'primary_id', p_primary_id, 'merged_contacts', v_expected, 'moved_relations', v_moved ); END; $function$;
--   CREATE OR REPLACE FUNCTION public.talkx_resolve_audience(p_rules jsonb DEFAULT NULL::jsonb, p_segment_ids uuid[] DEFAULT NULL::uuid[], p_mode text DEFAULT 'count'::text, p_limit integer DEFAULT NULL::integer, p_after uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_uid uuid := auth.uid(); v_mode text; v_groups jsonb := '[]'::jsonb; v_rules jsonb; v_limit integer; v_rows jsonb := '[]'::jsonb; v_matched bigint := 0; v_eligible bigint := 0; v_suppressed bigint := 0; v_invalid bigint := 0; v_legacy bigint := 0; v_has_more boolean := false; v_next_after uuid; BEGIN IF v_uid IS NULL OR COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_audience_role_required' USING ERRCODE = '42501'; END IF; v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'count')); IF v_mode NOT IN ('count', 'sample', 'page') THEN RAISE EXCEPTION 'invalid_talkx_audience_mode' USING ERRCODE = '22023'; END IF; IF p_after IS NOT NULL AND v_mode <> 'page' THEN RAISE EXCEPTION 'invalid_talkx_audience_after' USING ERRCODE = '22023'; END IF; IF p_rules IS NOT NULL THEN IF jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; IF p_rules ? 'groups' THEN IF jsonb_typeof(p_rules -> 'groups') <> 'array' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; v_groups := v_groups || (p_rules -> 'groups'); END IF; END IF; IF p_segment_ids IS NOT NULL AND cardinality(p_segment_ids) > 0 THEN v_groups := v_groups || COALESCE( (SELECT jsonb_agg(grp.value) FROM public.talkx_segments seg CROSS JOIN LATERAL jsonb_array_elements(COALESCE(seg.rules -> 'groups', '[]'::jsonb)) AS grp(value) WHERE seg.id = ANY(p_segment_ids)), '[]'::jsonb); END IF; v_rules := jsonb_build_object('groups', v_groups); IF v_mode = 'count' THEN SELECT count(*), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND q.invalid_phone), count(*) FILTER (WHERE q.legacy_or_deleted), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) INTO v_matched, v_eligible, v_invalid, v_legacy, v_suppressed FROM public.talkx_audience_query(v_rules, NULL, true) AS q; RETURN jsonb_build_object( 'mode', 'count', 'matched', v_matched, 'eligible', v_eligible, 'suppressed', v_suppressed, 'invalid_phone', v_invalid, 'legacy_or_deleted', v_legacy ); END IF; IF v_mode = 'sample' THEN v_limit := least(greatest(COALESCE(p_limit, 50), 1), 50); ELSE v_limit := least(greatest(COALESCE(p_limit, 50), 1), 1000); END IF; SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.cid), '[]'::jsonb) INTO v_rows FROM ( SELECT c.id AS cid, jsonb_build_object( 'id', c.id, 'name', c.name, 'nickname', c.nickname, 'phone', CASE WHEN length(regexp_replace(c.phone, '\D', '', 'g')) <= 8 THEN repeat('*', length(regexp_replace(c.phone, '\D', '', 'g'))) ELSE left(regexp_replace(c.phone, '\D', '', 'g'), 4) || repeat('*', greatest(length(regexp_replace(c.phone, '\D', '', 'g')) - 8, 0)) || right(regexp_replace(c.phone, '\D', '', 'g'), 4) END, 'company', c.company, 'avatar_url', c.avatar_url, 'tags', c.tags ) AS row_data FROM public.talkx_audience_query(v_rules, NULL, true) AS q JOIN public.contacts AS c ON c.id = q.id WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed AND (p_after IS NULL OR c.id > p_after) ORDER BY c.id LIMIT v_limit ) AS s; IF v_mode = 'sample' THEN RETURN jsonb_build_object( 'mode', 'sample', 'rows', v_rows, 'count', jsonb_array_length(v_rows) ); END IF; v_has_more := jsonb_array_length(v_rows) >= v_limit; IF v_has_more THEN v_next_after := (v_rows -> -1 ->> 'id')::uuid; END IF; RETURN jsonb_build_object( 'mode', 'page', 'rows', v_rows, 'has_more', v_has_more, 'next_after', to_jsonb(v_next_after) ); END; $function$;
--   CREATE OR REPLACE FUNCTION public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[] DEFAULT NULL::uuid[], p_respect_suppression boolean DEFAULT true) RETURNS TABLE(id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_uid uuid := auth.uid(); v_phone_regex constant text := '^[0-9]{10,15}$'; v_backslash_d constant text := '\D'; v_groups jsonb; v_group jsonb; v_rule jsonb; v_match text; v_field text; v_op text; v_value text; v_kind text; v_col text; v_like text; v_ops text[]; v_rule_sql text; v_rules_sql text[]; v_groups_sql text[] := ARRAY[]::text[]; v_where text; v_sql text; v_threshold timestamptz; v_days integer; v_respect boolean := COALESCE(p_respect_suppression, true); v_require_granted boolean; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'talkx_audience_authentication_required' USING ERRCODE = '42501'; END IF; v_where := format('public.is_contact_visible_to_user(c.id, %L::uuid)', v_uid); IF p_contact_ids IS NOT NULL THEN v_where := v_where || format(' AND c.id = ANY(%L::uuid[])', p_contact_ids); END IF; v_where := v_where || ' AND c.consent_status IS DISTINCT FROM ''revoked'''; SELECT COALESCE((settings.value #>> '{}')::boolean, false) INTO v_require_granted FROM public.talkx_settings AS settings WHERE settings.key = 'require_granted_consent'; IF v_require_granted IS TRUE THEN v_where := v_where || ' AND c.consent_status = ''granted'''; END IF; IF p_rules IS NOT NULL THEN IF jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; v_groups := p_rules -> 'groups'; IF v_groups IS NOT NULL THEN IF jsonb_typeof(v_groups) <> 'array' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; FOR v_group IN SELECT grp.value FROM jsonb_array_elements(v_groups) AS grp(value) LOOP IF jsonb_typeof(v_group) <> 'object' THEN RAISE EXCEPTION 'invalid_talkx_audience_group' USING ERRCODE = '22023'; END IF; v_match := v_group ->> 'match'; IF v_match IS NULL OR v_match NOT IN ('and', 'or') THEN RAISE EXCEPTION 'invalid_talkx_audience_group_match' USING ERRCODE = '22023'; END IF; IF jsonb_typeof(v_group -> 'rules') <> 'array' THEN RAISE EXCEPTION 'invalid_talkx_audience_group_rules' USING ERRCODE = '22023'; END IF; v_rules_sql := ARRAY[]::text[]; FOR v_rule IN SELECT r.value FROM jsonb_array_elements(v_group -> 'rules') AS r(value) LOOP IF jsonb_typeof(v_rule) <> 'object' THEN RAISE EXCEPTION 'invalid_talkx_audience_rule' USING ERRCODE = '22023'; END IF; v_field := v_rule ->> 'field'; v_op := v_rule ->> 'op'; v_value := v_rule ->> 'value'; v_kind := CASE v_field WHEN 'tags' THEN 'array' WHEN 'company' THEN 'text' WHEN 'city' THEN 'text' WHEN 'state' THEN 'text' WHEN 'group_category' THEN 'enum' WHEN 'email' THEN 'text' WHEN 'channel_type' THEN 'text' WHEN 'lead_origin' THEN 'text' WHEN 'assigned_to' THEN 'uuid' WHEN 'contact_type' THEN 'enum' WHEN 'conversation_status' THEN 'enum' WHEN 'lead_score' THEN 'number' WHEN 'risk_score' THEN 'number' WHEN 'ai_priority' THEN 'enum' WHEN 'ai_sentiment' THEN 'enum' WHEN 'updated_at' THEN 'date' WHEN 'created_at' THEN 'date' WHEN 'consent_status' THEN 'enum' ELSE NULL END; IF v_kind IS NULL THEN RAISE EXCEPTION 'invalid_talkx_audience_field' USING ERRCODE = '22023'; END IF; v_ops := CASE v_kind WHEN 'text' THEN ARRAY['eq','neq','contains','not_contains','is_set','is_empty'] WHEN 'enum' THEN ARRAY['eq','neq','is_empty'] WHEN 'uuid' THEN ARRAY['eq','neq','is_empty'] WHEN 'array' THEN ARRAY['contains','not_contains','is_empty'] WHEN 'number' THEN ARRAY['eq','gt','gte','lt','lte'] WHEN 'date' THEN ARRAY['in_last_days','not_in_last_days'] END; IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN RAISE EXCEPTION 'invalid_talkx_audience_operator' USING ERRCODE = '22023'; END IF; IF v_op <> 'is_set' AND v_op <> 'is_empty' AND (v_value IS NULL OR btrim(v_value) = '') THEN RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023'; END IF; IF v_kind = 'number' THEN BEGIN PERFORM btrim(v_value)::numeric; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023'; END; ELSIF v_kind = 'uuid' AND v_op <> 'is_empty' THEN BEGIN PERFORM btrim(v_value)::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023'; END; ELSIF v_kind = 'date' THEN BEGIN v_days := btrim(v_value)::integer; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023'; END; IF v_days IS NULL OR v_days < 1 THEN RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023'; END IF; END IF; v_col := format('c.%I', v_field); IF v_op = 'is_set' THEN v_rule_sql := format('%s IS NOT NULL', v_col); ELSIF v_op = 'is_empty' THEN IF v_kind = 'array' THEN v_rule_sql := format('(%s IS NULL OR %s = %L::text[])', v_col, v_col, '{}'); ELSIF v_kind = 'uuid' THEN v_rule_sql := format('%s IS NULL', v_col); ELSE v_rule_sql := format('(%s IS NULL OR %s = %L)', v_col, v_col, ''); END IF; ELSIF v_op = 'contains' THEN IF v_kind = 'array' THEN v_rule_sql := format('%s @> ARRAY[%L]::text[]', v_col, v_value); ELSE v_like := '%' || v_value || '%'; v_rule_sql := format('%s ILIKE %L', v_col, v_like); END IF; ELSIF v_op = 'not_contains' THEN IF v_kind = 'array' THEN v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_col, v_col, v_value); ELSE v_like := '%' || v_value || '%'; v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_col, v_col, v_like); END IF; ELSIF v_op = 'eq' THEN IF v_kind = 'number' THEN v_rule_sql := format('%s = %L::numeric', v_col, v_value); ELSIF v_kind = 'uuid' THEN v_rule_sql := format('%s = %L::uuid', v_col, v_value); ELSE v_rule_sql := format('%s = %L', v_col, v_value); END IF; ELSIF v_op = 'neq' THEN IF v_kind = 'number' THEN v_rule_sql := format('(%s IS NULL OR %s <> %L::numeric)', v_col, v_col, v_value); ELSIF v_kind = 'uuid' THEN v_rule_sql := format('(%s IS NULL OR %s <> %L::uuid)', v_col, v_col, v_value); ELSE v_rule_sql := format('(%s IS NULL OR %s <> %L)', v_col, v_col, v_value); END IF; ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN v_rule_sql := format('%s %s %L::numeric', v_col, CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END, v_value); ELSIF v_op = 'in_last_days' OR v_op = 'not_in_last_days' THEN SELECT ((date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') - ((v_days - 1) || ' days')::interval) AT TIME ZONE 'America/Sao_Paulo') INTO v_threshold; IF v_op = 'in_last_days' THEN v_rule_sql := format('%s >= %L::timestamptz', v_col, v_threshold); ELSE v_rule_sql := format('%s < %L::timestamptz', v_col, v_threshold); END IF; END IF; v_rules_sql := v_rules_sql || v_rule_sql; END LOOP; IF array_length(v_rules_sql, 1) > 0 THEN IF v_match = 'or' THEN v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' OR ') || ')'); ELSE v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' AND ') || ')'); END IF; END IF; END LOOP; END IF; END IF; IF array_length(v_groups_sql, 1) > 0 THEN v_where := v_where || ' AND (' || array_to_string(v_groups_sql, ' OR ') || ')'; END IF; v_sql := format( 'SELECT c.id, ' || '(c.deleted_at IS NOT NULL OR c.is_lid_legacy) AS legacy_or_deleted, ' || '(c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone !~ %L) AS invalid_phone, ' || '(%s AND c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone ~ %L AND EXISTS (' || 'SELECT 1 FROM public.talkx_blacklist bl ' || 'WHERE bl.removed_at IS NULL ' || 'AND (bl.expires_at IS NULL OR bl.expires_at > statement_timestamp()) ' || 'AND (bl.contact_id = c.id OR (bl.phone IS NOT NULL ' || 'AND regexp_replace(bl.phone, %L, %L, %L) = regexp_replace(c.phone, %L, %L, %L))))) AS is_suppressed ' || 'FROM public.contacts c WHERE %s', v_phone_regex, CASE WHEN v_respect THEN 'true' ELSE 'false' END, v_phone_regex, v_backslash_d, '', 'g', v_backslash_d, '', 'g', v_where ); RETURN QUERY EXECUTE v_sql; END; $function$;
--   drop table public.arquivo_contacts_tags_20261012;

-- ===== 1. Arquivo das etiquetas antes de derrubar a coluna =====================
-- Tabela de arquivo: guarda (contact_id, tags, arquivado_em) das linhas com etiqueta.
-- RLS ligada, NENHUMA policy: so o dono e o service_role (BYPASSRLS) leem.
create table public.arquivo_contacts_tags_20261012 (
  contact_id uuid primary key,
  tags text[] not null,
  arquivado_em timestamp with time zone not null default now()
);

insert into public.arquivo_contacts_tags_20261012 (contact_id, tags)
select c.id, c.tags
  from public.contacts c
 where c.tags is not null and cardinality(c.tags) > 0
on conflict (contact_id) do nothing;

alter table public.arquivo_contacts_tags_20261012 enable row level security;
revoke all on table public.arquivo_contacts_tags_20261012 from public, anon, authenticated;
grant select on table public.arquivo_contacts_tags_20261012 to service_role;

-- ===== 2. Funcoes que liam contacts.tags, sem ela ==============================
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
       WHERE key NOT IN ('name','surname','nickname','phone','email','company','job_title','contact_type','avatar_url')
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

CREATE OR REPLACE FUNCTION public.talkx_resolve_audience(p_rules jsonb DEFAULT NULL::jsonb, p_segment_ids uuid[] DEFAULT NULL::uuid[], p_mode text DEFAULT 'count'::text, p_limit integer DEFAULT NULL::integer, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_groups jsonb := '[]'::jsonb;
  v_rules jsonb;
  v_limit integer;
  v_rows jsonb := '[]'::jsonb;
  v_matched bigint := 0;
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_invalid bigint := 0;
  v_legacy bigint := 0;
  v_has_more boolean := false;
  v_next_after uuid;
BEGIN
  IF v_uid IS NULL OR COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_audience_role_required' USING ERRCODE = '42501';
  END IF;

  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'count'));
  IF v_mode NOT IN ('count', 'sample', 'page') THEN
    RAISE EXCEPTION 'invalid_talkx_audience_mode' USING ERRCODE = '22023';
  END IF;

  IF p_after IS NOT NULL AND v_mode <> 'page' THEN
    RAISE EXCEPTION 'invalid_talkx_audience_after' USING ERRCODE = '22023';
  END IF;

  -- Une as regras explicitas (p_rules) com as dos segmentos salvos (p_segment_ids):
  -- os grupos combinam por OU, entao concatenar grupos e exatamente a uniao das audiencias.
  IF p_rules IS NOT NULL THEN
    IF jsonb_typeof(p_rules) <> 'object' THEN
      RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
    END IF;
    IF p_rules ? 'groups' THEN
      IF jsonb_typeof(p_rules -> 'groups') <> 'array' THEN
        RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
      END IF;
      v_groups := v_groups || (p_rules -> 'groups');
    END IF;
  END IF;

  IF p_segment_ids IS NOT NULL AND cardinality(p_segment_ids) > 0 THEN
    v_groups := v_groups || COALESCE(
      (SELECT jsonb_agg(grp.value)
         FROM public.talkx_segments seg
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(seg.rules -> 'groups', '[]'::jsonb)) AS grp(value)
        WHERE seg.id = ANY(p_segment_ids)),
      '[]'::jsonb);
  END IF;

  v_rules := jsonb_build_object('groups', v_groups);

  IF v_mode = 'count' THEN
    SELECT count(*),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND q.invalid_phone),
           count(*) FILTER (WHERE q.legacy_or_deleted),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed)
      INTO v_matched, v_eligible, v_invalid, v_legacy, v_suppressed
      FROM public.talkx_audience_query(v_rules, NULL, true) AS q;

    RETURN jsonb_build_object(
      'mode', 'count',
      'matched', v_matched,
      'eligible', v_eligible,
      'suppressed', v_suppressed,
      'invalid_phone', v_invalid,
      'legacy_or_deleted', v_legacy
    );
  END IF;

  IF v_mode = 'sample' THEN
    v_limit := least(greatest(COALESCE(p_limit, 50), 1), 50);
  ELSE
    v_limit := least(greatest(COALESCE(p_limit, 50), 1), 1000);
  END IF;

  SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.cid), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT c.id AS cid,
             jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'nickname', c.nickname,
               'phone', CASE
                 WHEN length(regexp_replace(c.phone, '\D', '', 'g')) <= 8
                   THEN repeat('*', length(regexp_replace(c.phone, '\D', '', 'g')))
                 ELSE left(regexp_replace(c.phone, '\D', '', 'g'), 4)
                      || repeat('*', greatest(length(regexp_replace(c.phone, '\D', '', 'g')) - 8, 0))
                      || right(regexp_replace(c.phone, '\D', '', 'g'), 4)
               END,
               'company', c.company,
               'avatar_url', c.avatar_url
             ) AS row_data
        FROM public.talkx_audience_query(v_rules, NULL, true) AS q
        JOIN public.contacts AS c ON c.id = q.id
       WHERE NOT q.legacy_or_deleted
         AND NOT q.invalid_phone
         AND NOT q.is_suppressed
         AND (p_after IS NULL OR c.id > p_after)
       ORDER BY c.id
       LIMIT v_limit
    ) AS s;

  IF v_mode = 'sample' THEN
    RETURN jsonb_build_object(
      'mode', 'sample',
      'rows', v_rows,
      'count', jsonb_array_length(v_rows)
    );
  END IF;

  v_has_more := jsonb_array_length(v_rows) >= v_limit;
  IF v_has_more THEN
    v_next_after := (v_rows -> -1 ->> 'id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'mode', 'page',
    'rows', v_rows,
    'has_more', v_has_more,
    'next_after', to_jsonb(v_next_after)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[] DEFAULT NULL::uuid[], p_respect_suppression boolean DEFAULT true)
 RETURNS TABLE(id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_phone_regex constant text := '^[0-9]{10,15}$';
  v_backslash_d constant text := '\D';
  v_groups jsonb;
  v_group jsonb;
  v_rule jsonb;
  v_match text;
  v_field text;
  v_op text;
  v_value text;
  v_kind text;
  v_col text;
  v_like text;
  v_ops text[];
  v_rule_sql text;
  v_rules_sql text[];
  v_groups_sql text[] := ARRAY[]::text[];
  v_where text;
  v_sql text;
  v_threshold timestamptz;
  v_days integer;
  v_respect boolean := COALESCE(p_respect_suppression, true);
  v_require_granted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'talkx_audience_authentication_required' USING ERRCODE = '42501';
  END IF;

  v_where := format('public.is_contact_visible_to_user(c.id, %L::uuid)', v_uid);

  IF p_contact_ids IS NOT NULL THEN
    v_where := v_where || format(' AND c.id = ANY(%L::uuid[])', p_contact_ids);
  END IF;

  -- X032 (N10): quem pediu para sair NUNCA volta a audiencia. O filtro e mandatorio e
  -- independe das regras do usuario; NULL (desconhecido) continua entrando.
  v_where := v_where || ' AND c.consent_status IS DISTINCT FROM ''revoked''';

  -- X032: modo estrito opcional. Padrao DESLIGADO — so passou a existir a coluna agora e
  -- a base inteira esta 'unknown'; ligar por padrao zeraria a audiencia.
  SELECT COALESCE((settings.value #>> '{}')::boolean, false)
    INTO v_require_granted
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'require_granted_consent';
  IF v_require_granted IS TRUE THEN
    v_where := v_where || ' AND c.consent_status = ''granted''';
  END IF;

  IF p_rules IS NOT NULL THEN
    IF jsonb_typeof(p_rules) <> 'object' THEN
      RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
    END IF;

    v_groups := p_rules -> 'groups';
    IF v_groups IS NOT NULL THEN
      IF jsonb_typeof(v_groups) <> 'array' THEN
        RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
      END IF;

      FOR v_group IN SELECT grp.value FROM jsonb_array_elements(v_groups) AS grp(value) LOOP
        IF jsonb_typeof(v_group) <> 'object' THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group' USING ERRCODE = '22023';
        END IF;

        v_match := v_group ->> 'match';
        IF v_match IS NULL OR v_match NOT IN ('and', 'or') THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group_match' USING ERRCODE = '22023';
        END IF;

        IF jsonb_typeof(v_group -> 'rules') <> 'array' THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group_rules' USING ERRCODE = '22023';
        END IF;

        v_rules_sql := ARRAY[]::text[];

        FOR v_rule IN SELECT r.value FROM jsonb_array_elements(v_group -> 'rules') AS r(value) LOOP
          IF jsonb_typeof(v_rule) <> 'object' THEN
            RAISE EXCEPTION 'invalid_talkx_audience_rule' USING ERRCODE = '22023';
          END IF;

          v_field := v_rule ->> 'field';
          v_op := v_rule ->> 'op';
          v_value := v_rule ->> 'value';

          -- Whitelist de campo (RULE_FIELDS) e o kind que decide os operadores.
          v_kind := CASE v_field
            WHEN 'company' THEN 'text'
            WHEN 'city' THEN 'text'
            WHEN 'state' THEN 'text'
            WHEN 'group_category' THEN 'enum'
            WHEN 'email' THEN 'text'
            WHEN 'channel_type' THEN 'text'
            WHEN 'lead_origin' THEN 'text'
            WHEN 'assigned_to' THEN 'uuid'
            WHEN 'contact_type' THEN 'enum'
            WHEN 'conversation_status' THEN 'enum'
            WHEN 'lead_score' THEN 'number'
            WHEN 'risk_score' THEN 'number'
            WHEN 'ai_priority' THEN 'enum'
            WHEN 'ai_sentiment' THEN 'enum'
            WHEN 'updated_at' THEN 'date'
            WHEN 'created_at' THEN 'date'
            WHEN 'consent_status' THEN 'enum'
            ELSE NULL
          END;
          IF v_kind IS NULL THEN
            RAISE EXCEPTION 'invalid_talkx_audience_field' USING ERRCODE = '22023';
          END IF;

          -- Whitelist de operador por kind (RULE_OPS).
          v_ops := CASE v_kind
            WHEN 'text' THEN ARRAY['eq','neq','contains','not_contains','is_set','is_empty']
            WHEN 'enum' THEN ARRAY['eq','neq','is_empty']
            WHEN 'uuid' THEN ARRAY['eq','neq','is_empty']
            WHEN 'array' THEN ARRAY['contains','not_contains','is_empty']
            WHEN 'number' THEN ARRAY['eq','gt','gte','lt','lte']
            WHEN 'date' THEN ARRAY['in_last_days','not_in_last_days']
          END;
          IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN
            RAISE EXCEPTION 'invalid_talkx_audience_operator' USING ERRCODE = '22023';
          END IF;

          IF v_op <> 'is_set' AND v_op <> 'is_empty'
             AND (v_value IS NULL OR btrim(v_value) = '') THEN
            RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
          END IF;

          -- Valida o tipo do valor ANTES de montar o cast, para o erro de contrato ser
          -- sempre 22023 (nunca um 22P02 cru do ::numeric/::uuid/::integer).
          IF v_kind = 'number' THEN
            BEGIN PERFORM btrim(v_value)::numeric; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
          ELSIF v_kind = 'uuid' AND v_op <> 'is_empty' THEN
            BEGIN PERFORM btrim(v_value)::uuid; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
          ELSIF v_kind = 'date' THEN
            BEGIN v_days := btrim(v_value)::integer; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
            IF v_days IS NULL OR v_days < 1 THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END IF;
          END IF;

          v_col := format('c.%I', v_field);

          IF v_op = 'is_set' THEN
            v_rule_sql := format('%s IS NOT NULL', v_col);
          ELSIF v_op = 'is_empty' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('(%s IS NULL OR %s = %L::text[])', v_col, v_col, '{}');
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('%s IS NULL', v_col);
            ELSE
              v_rule_sql := format('(%s IS NULL OR %s = %L)', v_col, v_col, '');
            END IF;
          ELSIF v_op = 'contains' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('%s @> ARRAY[%L]::text[]', v_col, v_value);
            ELSE
              v_like := '%' || v_value || '%';
              v_rule_sql := format('%s ILIKE %L', v_col, v_like);
            END IF;
          ELSIF v_op = 'not_contains' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_col, v_col, v_value);
            ELSE
              v_like := '%' || v_value || '%';
              v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_col, v_col, v_like);
            END IF;
          ELSIF v_op = 'eq' THEN
            IF v_kind = 'number' THEN
              v_rule_sql := format('%s = %L::numeric', v_col, v_value);
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('%s = %L::uuid', v_col, v_value);
            ELSE
              v_rule_sql := format('%s = %L', v_col, v_value);
            END IF;
          ELSIF v_op = 'neq' THEN
            IF v_kind = 'number' THEN
              v_rule_sql := format('(%s IS NULL OR %s <> %L::numeric)', v_col, v_col, v_value);
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('(%s IS NULL OR %s <> %L::uuid)', v_col, v_col, v_value);
            ELSE
              v_rule_sql := format('(%s IS NULL OR %s <> %L)', v_col, v_col, v_value);
            END IF;
          ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN
            v_rule_sql := format('%s %s %L::numeric', v_col,
              CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END,
              v_value);
          ELSIF v_op = 'in_last_days' OR v_op = 'not_in_last_days' THEN
            -- Inicio do dia de calendario em Sao Paulo, (dias-1) atras — mesma semantica
            -- de zonedDayStartISO(SEGMENT_TIMEZONE, dias - 1) no front.
            SELECT ((date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                     - ((v_days - 1) || ' days')::interval)
                    AT TIME ZONE 'America/Sao_Paulo')
              INTO v_threshold;
            IF v_op = 'in_last_days' THEN
              v_rule_sql := format('%s >= %L::timestamptz', v_col, v_threshold);
            ELSE
              v_rule_sql := format('%s < %L::timestamptz', v_col, v_threshold);
            END IF;
          END IF;

          v_rules_sql := v_rules_sql || v_rule_sql;
        END LOOP;

        IF array_length(v_rules_sql, 1) > 0 THEN
          IF v_match = 'or' THEN
            v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' OR ') || ')');
          ELSE
            v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' AND ') || ')');
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF array_length(v_groups_sql, 1) > 0 THEN
    v_where := v_where || ' AND (' || array_to_string(v_groups_sql, ' OR ') || ')';
  END IF;

  -- Toda classificacao e calculada em SQL parametrizado. A supressao por telefone compara
  -- o telefone normalizado dos dois lados (`\D` removido), como o app faz na blacklist.
  v_sql := format(
    'SELECT c.id, '
    || '(c.deleted_at IS NOT NULL OR c.is_lid_legacy) AS legacy_or_deleted, '
    || '(c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone !~ %L) AS invalid_phone, '
    || '(%s AND c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone ~ %L AND EXISTS ('
    ||     'SELECT 1 FROM public.talkx_blacklist bl '
    ||     'WHERE bl.removed_at IS NULL '
    ||     'AND (bl.expires_at IS NULL OR bl.expires_at > statement_timestamp()) '
    ||     'AND (bl.contact_id = c.id OR (bl.phone IS NOT NULL '
    ||          'AND regexp_replace(bl.phone, %L, %L, %L) = regexp_replace(c.phone, %L, %L, %L))))) AS is_suppressed '
    || 'FROM public.contacts c WHERE %s',
    v_phone_regex,
    CASE WHEN v_respect THEN 'true' ELSE 'false' END,
    v_phone_regex,
    v_backslash_d, '', 'g',
    v_backslash_d, '', 'g',
    v_where
  );

  RETURN QUERY EXECUTE v_sql;
END;
$function$;

-- ===== 3. search_contacts sem o parametro tag_filter e sem a coluna tags =======
-- Muda o retorno (sai a coluna tags): a assinatura antiga precisa sair antes.
drop function public.search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean);
CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0, include_legacy boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.notes, c.contact_type,
    c.created_at, c.updated_at, c.latitude, c.longitude,
    c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
    c.deleted_at IS NULL
    AND (include_legacy OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
    AND (v_search IS NULL OR (
      c.name      ILIKE '%' || v_search || '%' OR
      c.nickname  ILIKE '%' || v_search || '%' OR
      c.surname   ILIKE '%' || v_search || '%' OR
      c.phone     ILIKE '%' || v_search || '%' OR
      c.email     ILIKE '%' || v_search || '%' OR
      c.company   ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter       IS NULL OR c.company      = company_filter)
    AND (job_title_filter     IS NULL OR c.job_title    = job_title_filter)
    AND (date_from            IS NULL OR c.created_at  >= date_from)
    AND public.can_edit_contact(c.assigned_to, c.queue_id,
              (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
              (SELECT public.get_profile_id_for_user(auth.uid())),
              (SELECT public.is_admin_or_supervisor(auth.uid())))
  ORDER BY
    CASE WHEN sort_field='name'       AND sort_direction='asc'  THEN c.name       END ASC  NULLS LAST,
    CASE WHEN sort_field='name'       AND sort_direction='desc' THEN c.name       END DESC NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='asc'  THEN c.created_at END ASC  NULLS LAST,
    CASE WHEN sort_field='created_at' AND sort_direction='desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='asc'  THEN c.updated_at END ASC  NULLS LAST,
    CASE WHEN sort_field='updated_at' AND sort_direction='desc' THEN c.updated_at END DESC NULLS LAST,
    c.name ASC NULLS LAST,
    c.id   ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;

revoke all on function public.search_contacts(text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean) from public, anon;
grant execute on function public.search_contacts(text,text,text,text,timestamp with time zone,text,text,integer,integer,boolean) to authenticated, service_role;

-- ===== 4. RPCs de etiqueta que escreviam ou liam tags =========================
drop function public.replace_ai_conversation_tags(uuid, jsonb);
drop function public.add_wa_tag_if_not_exists(uuid, text, text);
drop function public.remove_wa_tag_by_prefix(uuid, text);
drop function public.remove_wa_label_from_all_contacts(uuid, text);
drop function public.rename_wa_label_on_all_contacts(uuid, text, text);
drop function public.talkx_segment_tags(uuid);

-- ===== 5. Tabela, indice e coluna =============================================
-- drop table leva junto as 5 policies, a FK para contacts e os 2 indices.
drop table public.ai_conversation_tags;
drop index public.idx_contacts_tags_gin;
alter table public.contacts drop column tags;

