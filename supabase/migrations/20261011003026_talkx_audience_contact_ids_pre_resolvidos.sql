-- talkx_audience_contact_ids_pre_resolvidos
-- nomes-antigos-conferidos: talkx_resolve_audience — a aridade da RPC muda de 5 para 6 (ganha p_contact_ids); o nome e o chamador (src/hooks) seguem iguais, so o overload antigo sai para o PostgREST nao ficar ambiguo.
-- Rollback: dropa a RPC de 6 argumentos e recria a de 5 (corpo anterior, p_contact_ids=NULL) com os mesmos GRANTs e COMMENT.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid, uuid[]);
--   CREATE OR REPLACE FUNCTION public.talkx_resolve_audience( p_rules jsonb DEFAULT NULL, p_segment_ids uuid[] DEFAULT NULL, p_mode text DEFAULT 'count', p_limit integer DEFAULT NULL, p_after uuid DEFAULT NULL ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_uid uuid := auth.uid(); v_mode text; v_groups jsonb := '[]'::jsonb; v_rules jsonb; v_limit integer; v_rows jsonb := '[]'::jsonb; v_matched bigint := 0; v_eligible bigint := 0; v_suppressed bigint := 0; v_invalid bigint := 0; v_legacy bigint := 0; v_has_more boolean := false; v_next_after uuid; BEGIN IF v_uid IS NULL OR COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_audience_role_required' USING ERRCODE = '42501'; END IF; v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'count')); IF v_mode NOT IN ('count', 'sample', 'page') THEN RAISE EXCEPTION 'invalid_talkx_audience_mode' USING ERRCODE = '22023'; END IF; IF p_after IS NOT NULL AND v_mode <> 'page' THEN RAISE EXCEPTION 'invalid_talkx_audience_after' USING ERRCODE = '22023'; END IF; IF p_rules IS NOT NULL THEN IF jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; IF p_rules ? 'groups' THEN IF jsonb_typeof(p_rules -> 'groups') <> 'array' THEN RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023'; END IF; v_groups := v_groups || (p_rules -> 'groups'); END IF; END IF; IF p_segment_ids IS NOT NULL AND cardinality(p_segment_ids) > 0 THEN v_groups := v_groups || COALESCE( (SELECT jsonb_agg(grp.value) FROM public.talkx_segments seg CROSS JOIN LATERAL jsonb_array_elements(COALESCE(seg.rules -> 'groups', '[]'::jsonb)) AS grp(value) WHERE seg.id = ANY(p_segment_ids)), '[]'::jsonb); END IF; v_rules := jsonb_build_object('groups', v_groups); IF v_mode = 'count' THEN SELECT count(*), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND q.invalid_phone), count(*) FILTER (WHERE q.legacy_or_deleted), count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) INTO v_matched, v_eligible, v_invalid, v_legacy, v_suppressed FROM public.talkx_audience_query(v_rules, NULL, true) AS q; RETURN jsonb_build_object( 'mode', 'count', 'matched', v_matched, 'eligible', v_eligible, 'suppressed', v_suppressed, 'invalid_phone', v_invalid, 'legacy_or_deleted', v_legacy ); END IF; IF v_mode = 'sample' THEN v_limit := least(greatest(COALESCE(p_limit, 50), 1), 50); ELSE v_limit := least(greatest(COALESCE(p_limit, 50), 1), 1000); END IF; SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.cid), '[]'::jsonb) INTO v_rows FROM ( SELECT c.id AS cid, jsonb_build_object( 'id', c.id, 'name', c.name, 'nickname', c.nickname, 'phone', CASE WHEN length(regexp_replace(c.phone, '\D', '', 'g')) <= 8 THEN repeat('*', length(regexp_replace(c.phone, '\D', '', 'g'))) ELSE left(regexp_replace(c.phone, '\D', '', 'g'), 4) || repeat('*', greatest(length(regexp_replace(c.phone, '\D', '', 'g')) - 8, 0)) || right(regexp_replace(c.phone, '\D', '', 'g'), 4) END, 'company', c.company, 'avatar_url', c.avatar_url, 'tags', c.tags ) AS row_data FROM public.talkx_audience_query(v_rules, NULL, true) AS q JOIN public.contacts AS c ON c.id = q.id WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed AND (p_after IS NULL OR c.id > p_after) ORDER BY c.id LIMIT v_limit ) AS s; IF v_mode = 'sample' THEN RETURN jsonb_build_object( 'mode', 'sample', 'rows', v_rows, 'count', jsonb_array_length(v_rows) ); END IF; v_has_more := jsonb_array_length(v_rows) >= v_limit; IF v_has_more THEN v_next_after := (v_rows -> -1 ->> 'id')::uuid; END IF; RETURN jsonb_build_object( 'mode', 'page', 'rows', v_rows, 'has_more', v_has_more, 'next_after', to_jsonb(v_next_after) ); END; $function$;
--   revoke all on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid) from public, anon;
--   grant execute on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid) to authenticated, service_role;
--   comment on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid) is 'Talk X (X016): audiencia unica resolvida no servidor. Modos count (matched/eligible/suppressed/invalid_phone/legacy_or_deleted), sample (<=50, telefone mascarado) e page (keyset por id, <=1000). Elegivel = deleted_at IS NULL, is_lid_legacy=false, phone ~ ''^[0-9]{10,15}$'' e visivel ao usuario; suprimido por contact_id ou telefone normalizado com removed_at IS NULL e expires_at futuro. Exige admin/supervisor (42501).';
--

drop function if exists public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid);

create or replace function public.talkx_resolve_audience(
  p_rules jsonb default null,
  p_segment_ids uuid[] default null,
  p_mode text default 'count',
  p_limit integer default null,
  p_after uuid default null,
  p_contact_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
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
begin
  if v_uid is null or coalesce(public.is_admin_or_supervisor(v_uid), false) is not true then
    raise exception 'talkx_audience_role_required' using errcode = '42501';
  end if;

  v_mode := lower(coalesce(nullif(btrim(p_mode), ''), 'count'));
  if v_mode not in ('count', 'sample', 'page') then
    raise exception 'invalid_talkx_audience_mode' using errcode = '22023';
  end if;

  if p_after is not null and v_mode <> 'page' then
    raise exception 'invalid_talkx_audience_after' using errcode = '22023';
  end if;

  -- Une as regras explicitas (p_rules) com as dos segmentos salvos (p_segment_ids):
  -- os grupos combinam por OU, entao concatenar grupos e exatamente a uniao das audiencias.
  if p_rules is not null then
    if jsonb_typeof(p_rules) <> 'object' then
      raise exception 'invalid_talkx_audience_rules' using errcode = '22023';
    end if;
    if p_rules ? 'groups' then
      if jsonb_typeof(p_rules -> 'groups') <> 'array' then
        raise exception 'invalid_talkx_audience_rules' using errcode = '22023';
      end if;
      v_groups := v_groups || (p_rules -> 'groups');
    end if;
  end if;

  if p_segment_ids is not null and cardinality(p_segment_ids) > 0 then
    v_groups := v_groups || coalesce(
      (select jsonb_agg(grp.value)
         from public.talkx_segments seg
         cross join lateral jsonb_array_elements(coalesce(seg.rules -> 'groups', '[]'::jsonb)) as grp(value)
        where seg.id = any(p_segment_ids)),
      '[]'::jsonb);
  end if;

  v_rules := jsonb_build_object('groups', v_groups);

  if v_mode = 'count' then
    select count(*),
           count(*) filter (where not q.legacy_or_deleted and not q.invalid_phone and not q.is_suppressed),
           count(*) filter (where not q.legacy_or_deleted and q.invalid_phone),
           count(*) filter (where q.legacy_or_deleted),
           count(*) filter (where not q.legacy_or_deleted and not q.invalid_phone and q.is_suppressed)
      into v_matched, v_eligible, v_invalid, v_legacy, v_suppressed
      from public.talkx_audience_query(v_rules, p_contact_ids, true) as q;

    return jsonb_build_object(
      'mode', 'count',
      'matched', v_matched,
      'eligible', v_eligible,
      'suppressed', v_suppressed,
      'invalid_phone', v_invalid,
      'legacy_or_deleted', v_legacy
    );
  end if;

  if v_mode = 'sample' then
    v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);
  else
    v_limit := least(greatest(coalesce(p_limit, 50), 1), 1000);
  end if;

  select coalesce(jsonb_agg(s.row_data order by s.cid), '[]'::jsonb)
    into v_rows
    from (
      select c.id as cid,
             jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'nickname', c.nickname,
               'phone', case
                 when length(regexp_replace(c.phone, '\D', '', 'g')) <= 8
                   then repeat('*', length(regexp_replace(c.phone, '\D', '', 'g')))
                 else left(regexp_replace(c.phone, '\D', '', 'g'), 4)
                      || repeat('*', greatest(length(regexp_replace(c.phone, '\D', '', 'g')) - 8, 0))
                      || right(regexp_replace(c.phone, '\D', '', 'g'), 4)
               end,
               'company', c.company,
               'avatar_url', c.avatar_url,
               'tags', c.tags
             ) as row_data
        from public.talkx_audience_query(v_rules, p_contact_ids, true) as q
        join public.contacts as c on c.id = q.id
       where not q.legacy_or_deleted
         and not q.invalid_phone
         and not q.is_suppressed
         and (p_after is null or c.id > p_after)
       order by c.id
       limit v_limit
    ) as s;

  if v_mode = 'sample' then
    return jsonb_build_object(
      'mode', 'sample',
      'rows', v_rows,
      'count', jsonb_array_length(v_rows)
    );
  end if;

  v_has_more := jsonb_array_length(v_rows) >= v_limit;
  if v_has_more then
    v_next_after := (v_rows -> -1 ->> 'id')::uuid;
  end if;

  return jsonb_build_object(
    'mode', 'page',
    'rows', v_rows,
    'has_more', v_has_more,
    'next_after', to_jsonb(v_next_after)
  );
end;
$function$;

revoke all on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid, uuid[])
  from public, anon;
grant execute on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid, uuid[])
  to authenticated, service_role;

comment on function public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid, uuid[]) is
  'Talk X (X016): audiencia unica resolvida no servidor. Modos count (matched/eligible/suppressed/invalid_phone/legacy_or_deleted), sample (<=50, telefone mascarado) e page (keyset por id, <=1000). Elegivel = deleted_at IS NULL, is_lid_legacy=false, phone ~ ''^[0-9]{10,15}$'' e visivel ao usuario; suprimido por contact_id ou telefone normalizado com removed_at IS NULL e expires_at futuro. Exige admin/supervisor (42501). p_contact_ids (opcional) restringe a audiencia a esses contatos pre-resolvidos fora do banco (atividade real ramo/UF via ponte Singu); NULL = sem restricao, array vazio = nenhum contato.';

do $$
declare
  v_missing text;
begin
  select string_agg(a.assinatura, ', ')
    into v_missing
    from (values ('public.talkx_resolve_audience(jsonb,uuid[],text,integer,uuid,uuid[])')) as a(assinatura)
   where to_regprocedure(a.assinatura) is null;
  if v_missing is not null then
    raise exception 'talkx_audience_rpc_ausente: %', v_missing;
  end if;
end;
$$;
