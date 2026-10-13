-- ============================================================================
-- t_9dce259e — Monitor de regressao de permissao (ACL/RLS)  [worker (sql)]
--
-- O QUE PROVA (critério de pronto): public.score_security_acl()
-- (migration 20261013230008_security_acl_alerts_monitor.sql)
--   A) detecta as 5 regressões: SECURITY DEFINER com EXECUTE p/ anon/PUBLIC;
--      SECURITY DEFINER sem search_path; tabela sem RLS; policy de escrita
--      liberada (USING(true)/WITH CHECK(true)) p/ authenticated; bucket público;
--   B) NAO alerta o caso correto (controle negativo — o monitor não é tautológico);
--   C) idempotência: não repete alerta ABERTO (2 rodada = 0 novos);
--   D) resolve sozinho quando a violação volta ao normal;
--   E) reincidência gera alerta NOVO (id novo), não reabre o antigo;
--   F) public.security_acl_alerts só é LIDA por admin (RLS com PAPEL REAL
--      authenticated + user_roles 'admin'); anon não lê (sem GRANT) e
--      authenticated não escreve (sem GRANT);
--   G) a função não é executável por anon/authenticated (só service_role);
--   H) o job de cron está agendado de hora em hora e chama a função;
--   I) o rollback do cabeçalho da migration desfaz tudo e o ROLLBACK do teste
--      devolve o monitor ao estado migrado.
--
-- COMO RODA (banco LOCAL da tarefa já migrado):
--   zapp-db-local psql . v2-<id> < supabase/tests/security_acl_alerts_monitor.sql
-- VERMELHO (sem o monitor, prova que o teste é sensível):
--   zapp-db-local psql . v2-<id> -v sem_monitor=1 < supabase/tests/security_acl_alerts_monitor.sql
--
-- Tudo roda numa única transação que termina em ROLLBACK: sem efeito colateral.
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

\if :{?sem_monitor}
  DROP FUNCTION IF EXISTS public.score_security_acl();
  DROP TABLE IF EXISTS public.security_acl_alerts CASCADE;
  \echo '[sem_monitor] monitor derrubado dentro da transacao (modo vermelho)'
\endif

-- ── ambiente: um admin e um agente sinteticos (rollback ao fim) ──────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ADMIN monitor'),
  ('b0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 'AGENTE monitor')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'admin'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'agent')
ON CONFLICT (user_id, role) DO NOTHING;
SET session_replication_role = origin;

-- ── helpers ─────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 't_9dce259e FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Executa p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid.
-- Devolve 'OK <sqlstate> <valor>'/'OK <linhas>' ou 'ERRO <sqlstate> <msg>'.
CREATE FUNCTION pg_temp.roda(p_papel text, p_uid uuid, p_sql text, p_leitura boolean)
RETURNS text LANGUAGE plpgsql AS $h$
DECLARE v text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 't_9dce259e FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    IF p_leitura THEN
      EXECUTE p_sql INTO v;
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v := 'linhas ' || v_n;
    END IF;
    v := 'OK ' || coalesce(v, '');
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── T0: o monitor esta de pe (tabela, RLS, funcao, cron) ──────────────────'
SELECT pg_temp.espera('T0 tabela existe',
  to_regclass('public.security_acl_alerts')::text, 'security_acl_alerts');
SELECT pg_temp.espera('T0b funcao existe',
  (SELECT count(*)::text FROM pg_proc WHERE proname = 'score_security_acl'
     AND pronamespace = 'public'::regnamespace), '1');
SELECT pg_temp.espera('T0c RLS ligada',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.security_acl_alerts'::regclass), 'true');
SELECT pg_temp.espera('T0d authenticated TEM SELECT (a barreira e a RLS)',
  has_table_privilege('authenticated', 'public.security_acl_alerts', 'SELECT')::text, 'true');
SELECT pg_temp.espera('T0e authenticated NAO tem INSERT',
  has_table_privilege('authenticated', 'public.security_acl_alerts', 'INSERT')::text, 'false');
SELECT pg_temp.espera('T0f anon NAO tem SELECT',
  has_table_privilege('anon', 'public.security_acl_alerts', 'SELECT')::text, 'false');
SELECT pg_temp.espera('T0g job agendado de hora em hora',
  (SELECT schedule FROM cron.job WHERE jobname = 'security-acl-score'), '23 * * * *');
SELECT pg_temp.espera('T0h job chama a funcao',
  (SELECT (command LIKE '%score_security_acl%')::text FROM cron.job WHERE jobname = 'security-acl-score'), 'true');

-- baseline: roda o monitor uma vez para o estado inicial ficar gravado
SELECT public.score_security_acl();

\echo
\echo '── BLOCO A: SECURITY DEFINER exposto p/ anon/PUBLIC e sem search_path ─────'
-- A1: SECDEF sem search_path e com EXECUTE explicitamente p/ PUBLIC e anon.
-- (O banco local ja da EXECUTE a authenticated/service_role por default; o
--  que o monitor acusa e' justamente o vazamento para anon/PUBLIC.)
CREATE FUNCTION public.zz_prova_secd(_x integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER AS $f$ SELECT _x $f$;
GRANT EXECUTE ON FUNCTION public.zz_prova_secd(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.zz_prova_secd(integer) TO anon;
SELECT public.score_security_acl();
SELECT pg_temp.espera('A1 alerta SECDEF_ANON_EXECUTE (PUBLIC) CRITICAL',
  (SELECT severity || '|' || role_name FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'PUBLIC' AND resolved_at IS NULL),
  'CRITICAL|PUBLIC');
SELECT pg_temp.espera('A1b alerta SECDEF_ANON_EXECUTE (anon) CRITICAL',
  (SELECT severity || '|' || role_name FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'anon' AND resolved_at IS NULL),
  'CRITICAL|anon');
SELECT pg_temp.espera('A1c alerta SECDEF_SEM_SEARCH_PATH HIGH',
  (SELECT severity FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_SEM_SEARCH_PATH' AND resolved_at IS NULL), 'HIGH');

-- A2: controle negativo — SECDEF com search_path e EXECUTE so p/ papéis comuns
-- (authenticated/service_role, como no default) NAO gera alerta.
CREATE FUNCTION public.zz_prova_ok(_x integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$ SELECT _x $f$;
REVOKE EXECUTE ON FUNCTION public.zz_prova_ok(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.zz_prova_ok(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.zz_prova_ok(integer) TO authenticated;
SELECT public.score_security_acl();
SELECT pg_temp.espera('A2 funcao correta NAO gera alerta',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_ok(integer)'), '0');

\echo
\echo '── BLOCO B: idempotencia, resolucao automatica e reincidencia ────────────'
-- guarda o instante e o id do alerta aberto de A1 (papel PUBLIC)
CREATE TEMP TABLE _snap AS
  SELECT detected_at, id FROM public.security_acl_alerts
   WHERE object_name = 'zz_prova_secd(integer)'
     AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'PUBLIC' AND resolved_at IS NULL;
SELECT pg_temp.espera('B1 1 alerta aberto (nao duplicou na 2a rodada)',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'PUBLIC' AND resolved_at IS NULL), '1');
SELECT public.score_security_acl();
SELECT pg_temp.espera('B1b detected_at intacto na rodada repetida',
  (SELECT (a.detected_at = s.detected_at)::text FROM public.security_acl_alerts a, _snap s
     WHERE a.id = s.id), 'true');

-- B2: violacao some -> resolve sozinho
DROP FUNCTION public.zz_prova_secd(integer);
SELECT public.score_security_acl();
SELECT pg_temp.espera('B2 alerta aberto zerou',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'PUBLIC' AND resolved_at IS NULL), '0');
SELECT pg_temp.espera('B2b alerta antigo ficou RESOLVIDO com resolved_by',
  (SELECT resolved_by FROM public.security_acl_alerts WHERE id = (SELECT id FROM _snap)),
  'score_security_acl');

-- B3: reincidencia -> alerta NOVO (id diferente), nao reabre o antigo
CREATE FUNCTION public.zz_prova_secd(_x integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER AS $f$ SELECT _x $f$;
GRANT EXECUTE ON FUNCTION public.zz_prova_secd(integer) TO PUBLIC;
SELECT public.score_security_acl();
SELECT pg_temp.espera('B3 reincidencia abriu alerta com id NOVO',
  (SELECT (id <> (SELECT id FROM _snap))::text FROM public.security_acl_alerts
     WHERE object_name = 'zz_prova_secd(integer)'
       AND alert_type = 'SECDEF_ANON_EXECUTE' AND role_name = 'PUBLIC' AND resolved_at IS NULL), 'true');

\echo
\echo '── BLOCO C: tabela sem RLS ───────────────────────────────────────────────'
CREATE TABLE public.zz_prova_sem_rls (id integer);
SELECT public.score_security_acl();
SELECT pg_temp.espera('C1 tabela sem RLS alertada CRITICAL',
  (SELECT severity FROM public.security_acl_alerts
     WHERE object_name = 'public.zz_prova_sem_rls'
       AND alert_type = 'TABELA_SEM_RLS' AND resolved_at IS NULL), 'CRITICAL');
ALTER TABLE public.zz_prova_sem_rls ENABLE ROW LEVEL SECURITY;
SELECT public.score_security_acl();
SELECT pg_temp.espera('C2 RLS ligada -> alerta resolvido sozinho',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'public.zz_prova_sem_rls'
       AND alert_type = 'TABELA_SEM_RLS' AND resolved_at IS NULL), '0');

\echo
\echo '── BLOCO D: policy de ESCRITA liberada p/ authenticated ──────────────────'
CREATE TABLE public.zz_prova_policy (id integer);
ALTER TABLE public.zz_prova_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY zz_prova_bad ON public.zz_prova_policy
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
SELECT public.score_security_acl();
SELECT pg_temp.espera('D1 policy USING(true) p/ authenticated alertada HIGH',
  (SELECT severity || '|' || role_name FROM public.security_acl_alerts
     WHERE object_name = 'public.zz_prova_policy [UPDATE]'
       AND alert_type = 'POLICY_ESCRITA_LIBERADA' AND resolved_at IS NULL), 'HIGH|authenticated');
DROP POLICY zz_prova_bad ON public.zz_prova_policy;
SELECT public.score_security_acl();
SELECT pg_temp.espera('D2 policy restrita -> alerta resolvido',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'public.zz_prova_policy [UPDATE]'
       AND alert_type = 'POLICY_ESCRITA_LIBERADA' AND resolved_at IS NULL), '0');

\echo
\echo '── BLOCO E: bucket publico ───────────────────────────────────────────────'
INSERT INTO storage.buckets (id, name, public) VALUES ('zz-prova-bucket', 'zz-prova-bucket', true);
SELECT public.score_security_acl();
SELECT pg_temp.espera('E1 bucket publico alertado HIGH p/ anon',
  (SELECT severity || '|' || role_name FROM public.security_acl_alerts
     WHERE object_name = 'zz-prova-bucket'
       AND alert_type = 'BUCKET_PUBLICO' AND resolved_at IS NULL), 'HIGH|anon');
UPDATE storage.buckets SET public = false WHERE id = 'zz-prova-bucket';
SELECT public.score_security_acl();
SELECT pg_temp.espera('E2 bucket fechado -> alerta resolvido',
  (SELECT count(*)::text FROM public.security_acl_alerts
     WHERE object_name = 'zz-prova-bucket'
       AND alert_type = 'BUCKET_PUBLICO' AND resolved_at IS NULL), '0');

\echo
\echo '── BLOCO F: leitura so por ADMIN, com o PAPEL REAL ───────────────────────'
-- garante um alerta aberto para o admin enxergar
INSERT INTO public.security_acl_alerts (alert_type, object_name, role_name, privilege, severity)
VALUES ('ZZ_PROVA', 'zz_objeto', '-', '-', 'HIGH');

SELECT pg_temp.espera('F1 anon NAO le (sem GRANT)',
  left(pg_temp.roda('anon', NULL, 'SELECT count(*)::text FROM public.security_acl_alerts', true), 9), 'ERRO 4250');
SELECT pg_temp.espera('F2 authenticated NAO-admin ve 0 (RLS filtra)',
  pg_temp.roda('authenticated', 'bbbbbbbb-0000-4000-8000-00000000000b',
    'SELECT count(*)::text FROM public.security_acl_alerts', true), 'OK 0');
SELECT pg_temp.espera('F3 authenticated ADMIN ve os alertas',
  (left(pg_temp.roda('authenticated', 'aaaaaaaa-0000-4000-8000-00000000000a',
    'SELECT count(*)::text FROM public.security_acl_alerts', true), 3) <> 'OK 0')::text, 'true');
SELECT pg_temp.espera('F4 authenticated NAO escreve (sem GRANT)',
  left(pg_temp.roda('authenticated', 'aaaaaaaa-0000-4000-8000-00000000000a',
    $s$INSERT INTO public.security_acl_alerts (alert_type, object_name, severity)
       VALUES ('X','x','LOW')$s$, false), 9), 'ERRO 4250');

\echo
\echo '── BLOCO G: a funcao nao e executavel por anon/authenticated ─────────────'
SELECT pg_temp.espera('G1 anon NAO executa score_security_acl',
  left(pg_temp.roda('anon', NULL, 'SELECT public.score_security_acl()', true), 9), 'ERRO 4250');
SELECT pg_temp.espera('G2 authenticated NAO executa score_security_acl',
  left(pg_temp.roda('authenticated', 'aaaaaaaa-0000-4000-8000-00000000000a', 'SELECT public.score_security_acl()', true), 9), 'ERRO 4250');
SELECT pg_temp.espera('G3 service_role executa',
  left(pg_temp.roda('service_role', NULL, 'SELECT public.score_security_acl()', true), 4), 'OK {');

\echo
\echo '── BLOCO H: rollback de verdade (as linhas do cabecalho da migration) ─────'
SELECT pg_temp.espera('H0 antes do rollback o monitor existe',
  to_regclass('public.security_acl_alerts')::text, 'security_acl_alerts');
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'security-acl-score';
DROP FUNCTION IF EXISTS public.score_security_acl();
DROP TABLE IF EXISTS public.security_acl_alerts;
SELECT pg_temp.espera('H1 tabela removida pelo rollback',
  (to_regclass('public.security_acl_alerts') IS NULL)::text, 'true');
SELECT pg_temp.espera('H2 funcao removida pelo rollback',
  (SELECT count(*)::text FROM pg_proc WHERE proname = 'score_security_acl'), '0');
SELECT pg_temp.espera('H3 job removido pelo rollback',
  (SELECT count(*)::text FROM cron.job WHERE jobname = 'security-acl-score'), '0');

ROLLBACK;

-- Depois do ROLLBACK o monitor volta exatamente como a migration deixou.
\echo
\echo '── depois do ROLLBACK: o monitor esta de pe de novo ──────────────────────'
DO $d$
BEGIN
  IF to_regclass('public.security_acl_alerts') IS NULL THEN
    RAISE EXCEPTION 't_9dce259e FALHOU: a tabela nao voltou apos o ROLLBACK';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'score_security_acl') <> 1 THEN
    RAISE EXCEPTION 't_9dce259e FALHOU: a funcao nao voltou apos o ROLLBACK';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'security-acl-score') <> 1 THEN
    RAISE EXCEPTION 't_9dce259e FALHOU: o job nao voltou apos o ROLLBACK';
  END IF;
  RAISE NOTICE 'PASS [pos-rollback] tabela, funcao e job de volta';
END $d$;

\echo
\echo 't_9dce259e: TODAS as assercoes passaram.'
