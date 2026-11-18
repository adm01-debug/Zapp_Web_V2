do $$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', r.sig);
    v_n := v_n + 1;
  end loop;
  raise notice 'EXECUTE revogado (PUBLIC/anon/authenticated/service_role) em % funcao(oes) trigger de public', v_n;
end $$

REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_churn_risk(text) FROM PUBLIC, anon

REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_urgency(text)    FROM PUBLIC, anon

REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_priority(text)   FROM PUBLIC, anon

REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_sentiment(text)  FROM PUBLIC, anon

do $$
declare
  v_restou text;
begin
  select string_agg(distinct p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_restou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public'
     and p.prorettype = 'trigger'::regtype
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0
          or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'));
  if v_restou is not null then
    raise exception 'funcao(ns) trigger de public ainda com EXECUTE para papel da API: %', v_restou;
  end if;
  raise notice 'ok: 0 funcao(oes) trigger de public retem EXECUTE para PUBLIC/anon/authenticated/service_role';
end $$
