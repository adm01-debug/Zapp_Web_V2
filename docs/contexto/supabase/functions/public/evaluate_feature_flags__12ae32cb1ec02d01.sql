CREATE OR REPLACE FUNCTION public.evaluate_feature_flags()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_keys text[];
begin
  if v_uid is null then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(f.key order by f.key), '{}'::text[])
    into v_keys
  from public.feature_flags f
  where f.enabled
    and (f.expires_at is null or f.expires_at > now())
    and not (v_uid = any(f.blocked_user_ids))
    and (
      v_uid = any(f.allowed_user_ids)
      or (
        (
          cardinality(f.allowed_roles) = 0
          or exists (
            select 1
            from public.user_roles ur
            where ur.user_id = v_uid
              and ur.role::text = any(f.allowed_roles)
          )
        )
        and (
          f.rollout_percentage >= 100
          or ((hashtextextended(v_uid::text || '|' || f.key, 0) % 100) + 100) % 100 < f.rollout_percentage
        )
      )
    );

  return v_keys;
end;
$function$
