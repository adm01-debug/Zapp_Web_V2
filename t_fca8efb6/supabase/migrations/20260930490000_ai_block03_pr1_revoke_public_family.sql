-- ai_block03_pr1_revoke_public_family
-- versão 20260930490000 reservada para hermes-ia-bloco-03-pr1-mascaras-acl-26100108352104 em 2026-10-01T08:35:39-03:00 (hermes-db-migrar --nova)
-- Classe: contrato. ACL da familia do Bloco 03: revoga EXECUTE de PUBLIC/anon e garante grant explicito a
-- authenticated (helpers de CHECK) e service_role (RPCs). Troca a lista nominal de 20260930130000 por regra
-- de prefixo, para pegar helper novo sozinho. Nao altera dado. Fail-closed: aborta se role legitimo perder acesso.
-- rollback: grant execute on function public.ai_is_canonical_urgency(text) to public;
--           grant execute on function public.ai_is_canonical_churn_risk(text) to public;

-- Migration C — ACL: EXECUTE de PUBLIC/anon fora das funcoes do Bloco 03, com
-- regra por FAMILIA no lugar da lista nominal.
--
-- Nome sugerido (a versao e reservada pelo agente principal com
-- `hermes-db-migrar --nova=`): <VERSION>_ai_block03_revoke_public_family.sql
--
-- ── Por que esta migration existe ───────────────────────────────────────────
-- Medido no banco canonico (tnnnlkbymytvtqngbbqh, Postgres 17.6) e registrado em
-- supabase/schema-manifest.json no main pos-#1317: das 618 funcoes de public,
-- sobram exatamente DUAS com EXECUTE para PUBLIC, e ambas sao helpers criados
-- DEPOIS do endurecimento nominal:
--   f:ai_is_canonical_urgency(p_value text)|PUBLIC|EXECUTE|grantor=postgres
--   f:ai_is_canonical_churn_risk(p_value text)|PUBLIC|EXECUTE|grantor=postgres
-- Isso mantem VERMELHA a assercao 01-SEC-03 do proprio repo
-- (scripts/db-tests/01-security-grants.sql), que exige zero EXECUTE PUBLIC em
-- funcoes de negocio.
--
-- Causa-raiz do estado vivo: a 20260930130000 endureceu por LISTA NOMINAL de 5
-- nomes. Os dois helpers nasceram depois, na 20260930150000, e herdaram o
-- EXECUTE que o PostgreSQL concede a PUBLIC em toda funcao nova.
--
-- ── O que esta migration corrige ────────────────────────────────────────────
--   1) Troca a lista nominal por uma REGRA DE FAMILIA: `ai_is_canonical_%`
--      (qualquer helper novo da convencao entra sozinho) + o conjunto nomeado
--      do bloco (ai_text_array, persist_conversation_analysis,
--      replace_ai_conversation_tags). Idempotente.
--   2) Revoga EXECUTE de PUBLIC em TODA funcao de negocio de public — a regra
--      literal da assercao 01-SEC-03, nao a lista de nomes que alguem lembrou
--      de escrever. Idempotente.
--   3) Reafirma o acesso legitimo: helpers de CHECK continuam executaveis por
--      `authenticated` (sem isso a CHECK que os chama quebra o INSERT/UPDATE do
--      app) e as 2 RPCs de escrita continuam exclusivas do `service_role`
--      (decisao de minimo privilegio da 20260930150000 §5).
--
-- ── O que esta migration NAO consegue corrigir (medido, nao suposto) ────────
-- A camada de PRIVILEGIO PADRAO do schema nao serve para isto. Medido em
-- PostgreSQL 17 nos dois sentidos (ver .tmp/migC/94-probe-default-acl.sql):
--   * `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` altera o pg_default_acl
--      (a entrada de PUBLIC desaparece do catalogo)...
--   * ...e MESMO ASSIM a funcao criada depois nasce com proacl
--      `{=X/postgres, postgres=X/postgres, ...}` — o EXECUTE de PUBLIC que o
--      proprio PostgreSQL fixa em `acldefault()` para funcoes sobrevive, porque
--      a ACL padrao armazenada e ADITIVA ao built-in, e um REVOKE nao tem como
--      subtrair a entrada de `acldefault()`.
--   * Com o pg_default_acl removido por completo (0 linhas), a funcao nova
--      tambem nasce com PUBLIC (proacl NULL -> volta ao built-in).
-- Ou seja: a 20260930113613 "fechou o padrao" apenas do lado do `anon`, e o lado
-- de PUBLIC que ela deixou aberto NAO TEM conserto por ALTER DEFAULT PRIVILEGES.
-- Por isso este arquivo NAO inclui um ALTER DEFAULT PRIVILEGES inutil: seria
-- falsa sensacao de conserto. As duas alternativas reais ficam em §3 (opt-in).
--
-- ── Seguranca do REVOKE (fail-closed) ───────────────────────────────────────
-- Antes de revogar qualquer coisa a migration CONFERE, contra o catalogo vivo,
-- que toda funcao que perderia o EXECUTE de PUBLIC tem grant EXPLICITO para
-- `authenticated` ou `service_role`. Se alguma nao tiver, ela ABORTA inteira
-- (transacao) em vez de tirar acesso de um chamador legitimo.
-- Medicao que sustenta o caso concreto: as duas funcoes afetadas no canonico ja
-- tem os dois grants explicitos (manifesto pos-#1317), e NAO existe nenhuma
-- funcao de public com EXECUTE para `anon` — logo revogar PUBLIC nao remove
-- acesso de ninguem.
--
-- ── Fora de escopo (nao tocado) ─────────────────────────────────────────────
--   * Nenhum objeto de tabela, coluna, policy, indice ou dado.
--   * O bucket `enforce_bucket%` continua eximido (mesma excecao da assercao).
--   * Funcoes que PERTENCEM a uma extensao (`pg_depend.deptype = 'e'`) ficam de
--     fora: a ACL delas e gerida pelo CREATE EXTENSION. No canonico elas vivem no
--     schema `extensions`, nao em public — por isso a assercao so ve 2 nomes.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. PRE-CONDICAO: fail-closed. Ninguem legitimo pode perder acesso.
--    Excecoes (as mesmas de §1): `enforce_bucket%` e funcoes de extensao.
-- ════════════════════════════════════════════════════════════════════════════
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
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. REGRA GERAL (substitui a lista nominal da 20260930130000):
--    EXECUTE de PUBLIC fora de TODA funcao de negocio de public — que e a regra
--    literal da assercao 01-SEC-03, nao uma lista de nomes.
--    Idempotente: REVOKE de privilegio inexistente e no-op silencioso.
-- ════════════════════════════════════════════════════════════════════════════
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
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. REGRA DE FAMILIA do Bloco 03 — o que a lista nominal deveria ter sido.
--    `ai_is_canonical_%` cobre automaticamente qualquer helper novo da
--    convencao; a lista nomeada cobre os membros que nao seguem o prefixo.
--    Tambem revoga `anon` do conjunto (hoje no-op: nenhuma funcao de public tem
--    grant de anon no canonico — medido no manifesto pos-#1317).
-- ════════════════════════════════════════════════════════════════════════════
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
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. POS-CONDICAO: a assercao 01-SEC-03 passa a ter garantia estrutural.
-- ════════════════════════════════════════════════════════════════════════════
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
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3b. ALTERNATIVAS para o que §1 NAO cobre (nao habilitadas: decisao do dono).
--
-- Esta migration mata o EXECUTE PUBLIC que JA EXISTE. Ela nao impede que uma
-- funcao criada AMANHA nasca com PUBLIC — porque, como medido, o padrao do
-- schema nao consegue remover o built-in. As duas opcoes reais:
--
-- (i) GUARD no CI (recomendado primeiro): a assercao 01-SEC-03 vira passo
--     bloqueante do workflow que roda no PR, entao a PR que cria a funcao com
--     PUBLIC e barrada antes do merge, quando ainda e barato consertar.
--
-- (ii) EVENT TRIGGER em ddl_command_end — verificado funcionando neste ensaio
--      (nasce `sem PUBLIC`), mas e gancho global de DDL, exige superusuario e
--      passa a mexer na ACL de QUALQUER CREATE FUNCTION. Ligar isto e mudanca de
--      governanca, nao de higiene; por isso fica DESLIGADO por padrao.
--
--  -- ligar (importa o arquivo .tmp do ensaio como base):
--  create or replace function public.fn_acl_bloco03_autorevoke()
--  returns event_trigger language plpgsql security definer
--  set search_path = pg_catalog, public as $fn$
--  declare r record;
--  begin
--    for r in
--      select c.objid from pg_event_trigger_ddl_commands() c
--       where c.command_tag in ('CREATE FUNCTION','CREATE PROCEDURE')
--         and c.schema_name = 'public'
--         and c.classid = 'pg_proc'::regclass
--         and c.objid is not null
--    loop
--      declare v_sig text := (select p.oid::regprocedure::text from pg_proc p where p.oid = r.objid);
--      begin
--        if v_sig is not null then
--          execute format('revoke execute on function %s from public', v_sig);
--          execute format('revoke execute on function %s from anon',   v_sig);
--        end if;
--      end;
--    end loop;
--  end $fn$;
--  -- OBRIGATORIO: a propria funcao de suporte nasce ANTES do trigger existir e
--  -- por isso nasce com PUBLIC (medido: sem este revoke a assercao 01-SEC-03
--  -- FALHA no nome fn_acl_bloco03_autorevoke). Mesmo espirito de §1.
--  revoke execute on function public.fn_acl_bloco03_autorevoke() from public, anon;
--
--  create event trigger trg_acl_bloco03_autorevoke
--    on ddl_command_end
--    when tag in ('CREATE FUNCTION','CREATE PROCEDURE')
--    execute function public.fn_acl_bloco03_autorevoke();
--
--  -- desligar:
--  -- drop event trigger trg_acl_bloco03_autorevoke;
--  -- drop function public.fn_acl_bloco03_autorevoke();
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado e ensaiado no container; ver .tmp/migC/93-rollback.sql)
--
-- Curto (desfaz so o que esta migration ADICIONA): como ela nao cria objeto
-- nenhum e none altera default privileges, "desfazer" e devolver o EXECUTE de
-- PUBLIC aos 2 helpers — o que REINTRODUZ a falha da 01-SEC-03. Nao ha caminho
-- de rollback que restaure um estado bom: o estado anterior era o defeito.
--
--   -- rollback de emergencia (restaura exatamente o estado medido em 30/09):
--   GRANT EXECUTE ON FUNCTION public.ai_is_canonical_urgency(text)    TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.ai_is_canonical_churn_risk(text) TO PUBLIC;
--
-- Se (ii) tiver sido ligado, o rollback dele e:
--   DROP EVENT TRIGGER IF EXISTS trg_acl_bloco03_autorevoke;
--   DROP FUNCTION IF EXISTS public.fn_acl_bloco03_autorevoke();
-- ════════════════════════════════════════════════════════════════════════════
