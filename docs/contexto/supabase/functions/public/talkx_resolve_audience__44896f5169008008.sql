CREATE OR REPLACE FUNCTION public.talkx_resolve_audience(p_rules jsonb DEFAULT NULL::jsonb, p_segment_ids uuid[] DEFAULT NULL::uuid[], p_mode text DEFAULT 'count'::text, p_limit integer DEFAULT NULL::integer, p_after uuid DEFAULT NULL::uuid, p_contact_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
