do $$
declare
  v_n     bigint;
  v_orfas text;
begin
  with f as (
    select p.oid,
           p.oid::regprocedure                              as sig,
           coalesce(p.proacl, acldefault('f', p.proowner))    as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname not like 'enforce_bucket%'
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid
                          and d.classid = 'pg_proc'::regclass
                          and d.deptype = 'e')
  )
  select count(*), string_agg(sig::text, ', ' order by sig::text)
    into v_n, v_orfas
    from f
   where exists (select 1 from aclexplode(f.acl) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     and not exists (select 1
                       from aclexplode(f.acl) a
                       join pg_roles r on r.oid = a.grantee
                      where a.privilege_type = 'EXECUTE'
                        and r.rolname in ('authenticated', 'service_role'));

  if v_n > 0 then
    raise exception
      'migration C abortada: % funcao(oes) perderiam EXECUTE para PUBLIC sem grant explicito a authenticated/service_role: %',
      v_n, v_orfas;
  end if;
end $$

do $$
declare
  r    record;
  v_n  integer := 0;
begin
  for r in
    with f as (
      select p.oid,
             p.oid::regprocedure                              as sig,
             coalesce(p.proacl, acldefault('f', p.proowner))   as acl
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname not like 'enforce_bucket%'
         and not exists (select 1 from pg_depend d
                          where d.objid = p.oid
                            and d.classid = 'pg_proc'::regclass
                            and d.deptype = 'e')
    )
    select sig from f
     where exists (select 1 from aclexplode(f.acl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  loop
    execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    v_n := v_n + 1;
  end loop;
  raise notice 'migration C: EXECUTE de PUBLIC revogado em % funcao(oes) de public', v_n;
end $$

do $$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select p.oid::regprocedure                  as sig,
           (p.prorettype = 'trigger'::regtype)  as e_trigger,
           (p.proname like 'ai_is_canonical_%') as e_helper
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (
            p.proname like 'ai_is_canonical_%'   -- convencao: pega helper novo sozinho
         or p.proname in (
              'ai_text_array',                   -- helper de conversao jsonb -> text[]
              'persist_conversation_analysis',   -- RPC de escrita (service_role)
              'replace_ai_conversation_tags'     -- RPC de escrita (service_role)
            )
       )
  loop
    execute format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);

    if not r.e_trigger then
      if r.e_helper then
        -- Helpers de CHECK: o INSERT/UPDATE de `authenticated` avalia a
        -- constraint com privilegio de quem insere -> precisa de EXECUTE.
        execute format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
      else
        -- RPC de escrita: minimo privilegio, so service_role (20260930150000 §5).
        execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'migration C: familia do Bloco 03 normalizada em % funcao(oes)', v_n;
end $$

do $$
declare
  v_restou text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_restou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public'
     and p.proname not like 'enforce_bucket%'
     and a.grantee = 0
     and a.privilege_type = 'EXECUTE'
     and not exists (select 1 from pg_depend d
                      where d.objid = p.oid
                        and d.classid = 'pg_proc'::regclass
                        and d.deptype = 'e');
  if v_restou is not null then
    raise exception 'migration C: sobrou EXECUTE PUBLIC em funcao de negocio: %', v_restou;
  end if;

  -- Visibilidade, sem abortar: funcao de EXTENSAO em public com EXECUTE PUBLIC.
  -- No canonico nao existe (extensoes ficam em `extensions`), mas se aparecer
  -- ela tambem derruba a assercao 01-SEC-03 e o dono e a instalacao da extensao.
  select string_agg(p.proname, ', ' order by p.proname) into v_restou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public'
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'
     and exists (select 1 from pg_depend d
                  where d.objid = p.oid
                    and d.classid = 'pg_proc'::regclass
                    and d.deptype = 'e');
  if v_restou is not null then
    raise notice 'migration C: ATENCAO - funcao de EXTENSAO em public com EXECUTE PUBLIC (tira-la de public e o fix): %', v_restou;
  end if;

  -- Visibilidade, sem abortar: anon com grant explicito fora do bloco (zero hoje).
  select string_agg(p.proname, ', ' order by p.proname) into v_restou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and r.rolname = 'anon' and a.privilege_type = 'EXECUTE'
     and p.proname not like 'ai_is_canonical_%'
     and p.proname not in ('ai_text_array','persist_conversation_analysis','replace_ai_conversation_tags');
  if v_restou is not null then
    raise notice 'migration C: ATENCAO - funcao fora do Bloco 03 ainda com EXECUTE para anon: %', v_restou;
  end if;
end $$
