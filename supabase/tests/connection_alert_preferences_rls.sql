-- ============================================================================
-- connection_alert_preferences — RLS por linha (cartao t_e8b312e0)
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) a leitura e a escrita de public.connection_alert_preferences sao da
--      PROPRIA linha: o dono ve e muda as suas preferencias;
--   B) um usuario NAO ve, NAO insere e NAO muda a linha de OUTRO usuario
--      (RLS, nao a aplicacao);
--   C) NAO existe DELETE: nem grant nem policy — preferencia se desliga, nao
--      se apaga;
--   D) anon nao le nem escreve (o padrao Supabase concede ALL a anon em tabela
--      nova; aqui ele e revogado — licao E44);
--   E) os padroes nascem LIGADOS (push/e-mail/degradada/desconectada = true);
--   F) uma linha por usuario (UNIQUE em user_id) e updated_at automatico.
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superficie minima (roles, schema auth, auth.users, update_updated_at_column,
-- e as DEFAULT PRIVILEGES que a Supabase instala) e AMBIENTE, criada a mao; a
-- PROTECAO (tabela, RLS, policies, grants, gatilho) e aplicada VERBATIM do
-- arquivo de migration real, via `\i`. Mesmo padrao de
-- supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql e
-- scripts/db-audit/dashboard-rls-authorization.test.sh.
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated`/`anon` (roles sem BYPASSRLS, o caminho do PostgREST) + JWT
-- sintetico em request.jwt.claims — nunca como postgres, que ignora RLS. O
-- helper confere que current_user e de fato o papel pedido.
--
-- VIGENCIA: a tabela e NOVA neste cartao; nenhuma migration posterior a
-- 20261013044440 a toca (nao ha outra). Se um dia houver, este `\i` fica
-- desatualizado — a charada e repetir o padrao do dashboard-rls (varrer o
-- diretorio por CREATE/ALTER/DROP do mesmo objeto).
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-caeap-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-caeap-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/connection_alert_preferences_rls.sql
--   docker rm -f zapp-caeap-$$
--
-- VERMELHO (o teste falha quando a protecao nao esta la): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a RLS e DESLIGADA dentro da transacao (as policies ficam
--   inertes) e a isolacao entre usuarios cai — nada persiste porque o arquivo
--   termina em ROLLBACK.
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente, sem
-- efeito colateral e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima (ambiente; o contrato vem da migration logo abaixo) ────
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- Funcao canonica de updated_at (mesmo corpo de
-- supabase/migrations/20251215024517_...:188) — e ambiente, nao contrato.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- A Supabase instala DEFAULT PRIVILEGES que concedem ALL a anon, authenticated
-- e service_role em toda tabela nova do schema public. Reproduzir isso aqui e o
-- que faz o REVOKE da migration ser CARREGADO de verdade no T0.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ── A PROTECAO, verbatim da migration real ───────────────────────────────────
\echo '── aplicando a migration REAL (tabela, RLS, policies, grants, gatilho) ──'
\i :mig_dir/20261013044440_connection_alert_preferences.sql

-- Fixtures: dois usuarios (A = dono, B = outro). Entram como postgres; as
-- assercoes de comportamento rodam sob o papel REAL.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- A (dono)
  ('22222222-2222-2222-2222-22222222222b');  -- B (outro)

-- ── Modo vermelho: a protecao ausente (RLS desligada; policies inertes) ──────
\if :{?sem_guarda}
  ALTER TABLE public.connection_alert_preferences DISABLE ROW LEVEL SECURITY;
  \echo '  [sem_guarda] RLS de connection_alert_preferences DESLIGADA (dentro da transacao)'
\endif

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'CAEAP FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'CAEAP FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'. O bloco EXCEPTION
-- interno garante que uma operacao negada NAO aborta a transacao do teste.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'CAEAP FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

-- Um unico valor, lido sob o PAPEL REAL.
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── T0: a barreira e a RLS + os grants da migration, nao o acaso ────────────'
SELECT pg_temp.espera('T0a authenticated TEM SELECT/INSERT/UPDATE',
  has_table_privilege('authenticated', 'public.connection_alert_preferences', 'SELECT,INSERT,UPDATE')::text, 'true');
SELECT pg_temp.espera('T0b authenticated NAO tem DELETE (sem grant)',
  has_table_privilege('authenticated', 'public.connection_alert_preferences', 'DELETE')::text, 'false');
SELECT pg_temp.espera('T0c anon NAO tem nenhum privilegio (REVOKE venceu o default)',
  has_table_privilege('anon', 'public.connection_alert_preferences', 'SELECT,INSERT,UPDATE,DELETE')::text, 'false');
SELECT pg_temp.espera('T0d service_role tem ALL (BYPASSRLS, papel de servico)',
  has_table_privilege('service_role', 'public.connection_alert_preferences', 'SELECT,INSERT,UPDATE,DELETE')::text, 'true');
-- Auto-testes de aplicacao da protecao (pulados no modo vermelho).
\if :{?sem_guarda}
\else
SELECT pg_temp.espera('T0e RLS ligada na tabela',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.connection_alert_preferences'::regclass), 'true');
SELECT pg_temp.espera('T0f exatamente 3 policies, TODAS para authenticated',
  (SELECT (count(*) = 3 AND bool_and(roles = '{authenticated}'))::text
     FROM pg_policies WHERE tablename = 'connection_alert_preferences'), 'true');
SELECT pg_temp.espera('T0g nenhuma policy de DELETE',
  (SELECT (count(*) = 0)::text FROM pg_policies
     WHERE tablename = 'connection_alert_preferences' AND cmd = 'DELETE'), 'true');
SELECT pg_temp.espera('T0h gatilho de updated_at instalado em BEFORE UPDATE',
  (SELECT (pg_get_triggerdef(oid) LIKE '%BEFORE UPDATE%'
           AND pg_get_triggerdef(oid) LIKE '%update_updated_at_column%')::text
     FROM pg_trigger WHERE tgname = 'set_connection_alert_preferences_updated_at'), 'true');
\endif

\echo
\echo '── BLOCO A: o DONO cuida da PROPRIA linha ─────────────────────────────────'
-- T1 — INSERT so com user_id: padroes nascem LIGADOS.
SELECT pg_temp.espera('T1 dono insere a propria linha (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.connection_alert_preferences (user_id) VALUES ('11111111-1111-1111-1111-11111111111a')$sql$),
  'OK 1');
SELECT pg_temp.espera('T1b padroes ligados (push/email/degradada/desconectada = true)',
  (SELECT (push_enabled AND email_enabled AND alert_on_degraded AND alert_on_disconnected)::text
     FROM public.connection_alert_preferences WHERE user_id = '11111111-1111-1111-1111-11111111111a'), 'true');

-- Fixture do OUTRO usuario (postgres; o comportamento dele vem depois).
INSERT INTO public.connection_alert_preferences (user_id, push_enabled)
  VALUES ('22222222-2222-2222-2222-22222222222b', false);

-- T2 — o dono ve exatamente a propria linha; service_role (BYPASSRLS) ve as duas.
SELECT pg_temp.espera('T2a dono enxerga so a propria linha (1)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.connection_alert_preferences$sql$), '1');
SELECT pg_temp.espera('T2b o outro enxerga so a propria linha (1)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.connection_alert_preferences$sql$), '1');
SELECT pg_temp.espera('T2c service_role enxerga as duas (BYPASSRLS)',
  pg_temp.valor('service_role', null,
    $sql$SELECT count(*)::text FROM public.connection_alert_preferences$sql$), '2');

-- T3 — o dono NAO ve a linha do outro.
SELECT pg_temp.espera('T3 dono nao enxerga a linha do outro (0)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.connection_alert_preferences WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$),
  '0');

-- T4 — o dono atualiza a propria linha.
SELECT pg_temp.espera('T4 dono atualiza a propria linha (1)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.connection_alert_preferences SET email_enabled = true WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$),
  'OK 1');

-- T5 — o gatilho de updated_at SOBRESCREVE um valor forjado (prova que dispara).
SELECT pg_temp.espera('T5 gatilho updated_at sobrescreve valor forjado',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.connection_alert_preferences SET updated_at = '2000-01-01 00:00:00+00' WHERE user_id = '11111111-1111-1111-1111-11111111111a'; SELECT (updated_at <> '2000-01-01 00:00:00+00'::timestamptz)::text FROM public.connection_alert_preferences WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$),
  'true');

\echo
\echo '── BLOCO B: o dono NAO alcanca a linha do OUTRO ──────────────────────────'
-- T6 — INSERT apontando para OUTRO usuario: WITH CHECK recusa.
SELECT pg_temp.espera_erro('T6 INSERT para outro usuario e recusado (WITH CHECK)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.connection_alert_preferences (user_id) VALUES ('22222222-2222-2222-2222-22222222222b')$sql$),
  '42501');
SELECT pg_temp.espera('T6b a tentativa nao criou meia linha',
  (SELECT count(*)::text FROM public.connection_alert_preferences WHERE user_id = '22222222-2222-2222-2222-22222222222b'), '1');

-- T7 — UPDATE da linha do outro: USING falso -> 0 linhas, valor intacto.
SELECT pg_temp.espera('T7 UPDATE da linha do outro -> 0 linhas',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.connection_alert_preferences SET push_enabled = true WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$),
  'OK 0');
SELECT pg_temp.espera('T7b a linha do outro segue intacta (push_enabled = false)',
  (SELECT (NOT push_enabled)::text FROM public.connection_alert_preferences WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'true');

-- T8 — UPDATE tentando TROCAR o dono da propria linha: WITH CHECK recusa.
SELECT pg_temp.espera_erro('T8 trocar user_id da propria linha e recusado (WITH CHECK)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.connection_alert_preferences SET user_id = '22222222-2222-2222-2222-22222222222b' WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$),
  '42501');

\echo
\echo '── BLOCO C: sem DELETE, sem anon, uma linha por usuario ──────────────────'
-- T9 — DELETE negado (sem grant nem policy).
SELECT pg_temp.espera_erro('T9 DELETE da propria linha e negado',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.connection_alert_preferences WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$),
  '42501');
SELECT pg_temp.espera('T9b a linha continua la (nada apagou)',
  (SELECT count(*)::text FROM public.connection_alert_preferences WHERE user_id = '11111111-1111-1111-1111-11111111111a'), '1');

-- T10 — anon nao le nem escreve.
SELECT pg_temp.espera_erro('T10 anon nao SELECT',
  pg_temp.operacao('anon', null,
    $sql$SELECT count(*) FROM public.connection_alert_preferences$sql$),
  '42501');
SELECT pg_temp.espera_erro('T10b anon nao INSERT',
  pg_temp.operacao('anon', null,
    $sql$INSERT INTO public.connection_alert_preferences (user_id) VALUES ('11111111-1111-1111-1111-11111111111a')$sql$),
  '42501');

-- T11 — uma linha por usuario (UNIQUE em user_id).
SELECT pg_temp.espera_erro('T11 segunda linha do mesmo usuario e recusada (UNIQUE)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.connection_alert_preferences (user_id) VALUES ('11111111-1111-1111-1111-11111111111a')$sql$),
  '23505');

ROLLBACK;

\echo
\echo 'CAEAP OK: leitura/escrita so da propria linha; outro usuario e anon'
\echo '          negados; sem DELETE; padroes ligados; uma linha por usuario.'
