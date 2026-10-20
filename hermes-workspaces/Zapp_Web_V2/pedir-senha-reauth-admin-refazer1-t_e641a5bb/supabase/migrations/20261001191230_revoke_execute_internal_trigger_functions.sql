-- rollback: esta migration so faz REVOKE (nenhuma linha, objeto ou coluna e tocada); desfazer = devolver
--   o EXECUTE aos papeis da API na ORDEM INVERSA, o que REABRE a classe descrita abaixo:
--     -- 4 helpers de CHECK (remover so se quiser reabrir; quebra o veto da 01-SEC-03):
--     GRANT EXECUTE ON FUNCTION public.ai_is_canonical_churn_risk(text) TO PUBLIC, anon;
--     GRANT EXECUTE ON FUNCTION public.ai_is_canonical_urgency(text)    TO PUBLIC, anon;
--     GRANT EXECUTE ON FUNCTION public.ai_is_canonical_priority(text)   TO PUBLIC, anon;
--     GRANT EXECUTE ON FUNCTION public.ai_is_canonical_sentiment(text)  TO PUBLIC, anon;
--     -- 59 funcoes TRIGGER (estado medido pos-#1317); reabre o vetor de trigger forjado:
--     DO $$ DECLARE r record; BEGIN
--       FOR r IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--                 WHERE n.nspname='public' AND p.prorettype='trigger'::regtype LOOP
--         EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated, service_role', r.proname);
--       END LOOP; END $$;
--   Nenhum dado e removido; privilegio e reversivel com um GRANT.

-- ==============================================================================================
-- Fecha a classe "EXECUTE aberto em funcao INTERNA de public" que sobrou depois de #1254/#1258/
-- #1283/#1317. Classe: CONTRATO (ACL apenas; quem aplica e o coordenador, pos-merge). Idempotente:
-- REVOKE de privilegio ausente e no-op silencioso. Nao ha CREATE/ALTER/DML — so DCL de privilegio.
-- Medicao, SQL usado e lista nominal completa: <ws>/.tmp/RESUMO-REVOKE.md.
-- ==============================================================================================
--
-- (1) PRECISAO SOBRE O PAR CONHECIDO (medido, nao suposto) — a premissa estava PARCIALMENTE errada:
--     proacl vivo de public.ai_is_canonical_churn_risk(text) e public.ai_is_canonical_urgency(text) =
--       {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--     ou seja: PUBLIC e anon JA NAO tem EXECUTE (nenhuma entrada grantee=0); `authenticated` e
--     `service_role` tem. Motivo: a migration 20260930490000_ai_block03_pr1_revoke_public_family
--     (PR #1317) JA ESTA no ledger (supabase_migrations.schema_migrations) e revogou PUBLIC/anon na
--     FAMILIA `ai_is_canonical_%`, reafirmando GRANT a authenticated+service_role. A varredura do
--     #1258 nao as pegou; o #1317 fechou. §2 reafirma esse REVOKE (no-op defensivo hoje).
--     IMPORTANTE: `authenticated` NAO PODE perder EXECUTE — ai_is_canonical_churn_risk/urgency sao
--     chamadas por CHECK constraints de public.conversation_analyses
--     (conversation_analyses_churn_risk_canonical, conversation_analyses_urgency_canonical) e
--     sentiment/priority por contacts/conversation_analyses; uma CHECK avalia no contexto de QUEM
--     escreve. Contrato do repo: scripts/db-audit/ai-block03-vocabulary-contract.test.sh exige
--     has_function_privilege('authenticated', ai_is_canonical_*) = true.
--
-- (2) A CLASSE REAL QUE SOBRA — funcoes TRIGGER (RETURNS trigger) de public com EXECUTE para papel da
--     API. Sao 59 (37 com authenticated, 47 com service_role; lista nominal no RESUMO §2). Nenhuma e
--     RPC: funcao que retorna `trigger` NAO e chamavel por SELECT/PostgREST (o PG recusa "trigger
--     functions can only be called as triggers") e grep em src/, supabase/functions/, e2e/ e scripts/
--     nao acha NENHUMA chamada — so 2 mencoes em comentario (src/types/chat.ts,
--     src/hooks/integrations/useTalkXTemplates.ts). O EXECUTE so habilita o vetor de "trigger
--     forjado" que a 20260930370000 (#1283) fechou para 4 funcoes: papel com EXECUTE+TRIGGER+TEMPORARY
--     cria tabela TEMP com trigger apontando para a funcao SECURITY DEFINER e a executa como o dono
--     (postgres), onde as policies TO authenticated nao valem. Trigger function NAO confere EXECUTE do
--     chamador no disparo (quem confere e o CREATE TRIGGER) -> os triggers vivos seguem funcionando.
--     Aqui a regra e por FAMILIA (retorna trigger), nao lista nominal: pega funcao trigger nova sozinha.
--
-- (3) FORA DE ESCOPO (nao tocado): RPCs do front e do backend (categoria (a) — tem chamador real);
--     mcp_exec/mcp_exec_many (contrato proprio em scripts/db-audit/check-mcp-exec-acl.sql);
--     `enforce_bucket%` e funcoes de EXTENSAO (excecoes da assercao 01-SEC-03). Nenhum GRANT novo.
-- ==============================================================================================

-- ----------------------------------------------------------------------------------------------
-- §0. Categoria (b): REVOKE EXECUTE de PUBLIC, anon, authenticated e service_role em TODA funcao de
--     public que RETORNE trigger. Regra de familia (deterministica no catalogo, idempotente).
-- ----------------------------------------------------------------------------------------------
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
end $$;

-- ----------------------------------------------------------------------------------------------
-- §1. Reafirma o REVOKE de PUBLIC/anon nos 4 helpers ai_is_canonical_* (no-op hoje; defensivo contra
--     GRANT acidental futuro). NAO revoga authenticated/service_role: helper de CHECK, ver §(1).
-- ----------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_churn_risk(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_urgency(text)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_priority(text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_is_canonical_sentiment(text)  FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------------------------
-- §2. POS-CONDICAO fail-closed: nenhuma funcao trigger de public pode reter EXECUTE para papel da API.
--     Se restar alguma, ABORTA a migration em vez de deixar a classe aberta pela metade.
-- ----------------------------------------------------------------------------------------------
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
end $$;
