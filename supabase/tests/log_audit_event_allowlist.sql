-- ============================================================================
-- log_audit_event_allowlist — o cliente só grava ação PERMITIDA.
--
-- DEFEITO (cartão t_e2d34fee): public.log_audit_event(p_action text, ...) grava
-- QUALQUER texto em public.audit_logs.action. Um agente autenticado chamava a
-- RPC com action='role_granted'/'settings_changed'/... e forjava a trilha.
-- (O INSERT direto em audit_logs JÁ é negado no banco pela política
--  "Block direct audit log inserts"; a suíte confirma que segue negado.)
--
-- O QUE PROVA:
--   A) ação FORA da allowlist (role_granted, settings_changed, vazia, nula,
--      inventada) NÃO vira linha — sem erro (retorno neutro, sem oráculo);
--   B) ação DA allowlist (client_error, call_started, location_sent,
--      searchbox_session, gdpr_deletion_request, login) vira 1 linha do dono;
--   C) login no máximo 1x por dia por usuário;
--   D) teto de 4 KB no p_details (limite grava, limite+1 é barrado);
--   E) rate limit de 60 eventos/min por usuário;
--   F) INSERT DIRETO em audit_logs por authenticated/anon segue NEGADO (42501);
--   G) anon/service_role não gravam pela RPC (sem auth.uid());
--   H) p_entity_id inválido não derruba a gravação (comportamento preservado);
--   I) o ROLLBACK da migration roda e devolve o estado anterior (função antiga),
--      provado por comportamento.
--
-- COMO RODA (banco LOCAL da tarefa, montado com as migrations REAIS por
-- `zapp-db-local up`; NUNCA produção):
--   zapp-db-local psql . v2-26101304032a5b < supabase/tests/log_audit_event_allowlist.sql
-- O arquivo roda como postgres (monta fixtures e lê contagens) mas TODA operação
-- de escrita é exercida sob o PAPEL REAL (`SET LOCAL ROLE authenticated`/anon com
-- request.jwt.claims), o caminho do PostgREST — nunca como superusuário.
--
-- VERMELHO (antes da migration): o BLOCO A falha — role_granted grava (n=1).
-- Tudo roda numa transação que termina em ROLLBACK.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Helpers de asserção ─────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'ALLOWLIST FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT p_claims.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'; o EXCEPTION interno
-- garante que uma operação negada não aborta a transação do teste.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_claims json, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', p_claims::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'papel real nao aplicado (current_user=%)', current_user;
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

-- Chama a RPC real como o usuário p_uid (papel authenticated).
CREATE FUNCTION pg_temp.cartao(p_uid uuid, p_action text, p_det jsonb DEFAULT NULL, p_ent text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  v := pg_temp.operacao('authenticated',
    json_build_object('sub', p_uid, 'role', 'authenticated'),
    format('select public.log_audit_event(%L, NULL, %L, %L::jsonb, %L)',
           p_action, p_ent, p_det::text, 'sql-test'));
  -- RPC que devolve void nao tem linha util: normaliza para 'OK'
  RETURN CASE WHEN v LIKE 'OK%' THEN 'OK' ELSE v END;
END $h$;

-- Quantas linhas da ação p_action o usuário p_uid tem na trilha.
CREATE FUNCTION pg_temp.conta(p_uid uuid, p_action text) RETURNS bigint
LANGUAGE sql AS $h$
  SELECT count(*) FROM public.audit_logs WHERE user_id = p_uid AND action = p_action;
$h$;

-- Chama a RPC e conta DENTRO do plpgsql (ordem garantida: chama, depois conta),
-- devolvendo 'OK / n=N' ou 'ERRO ...'. Evita a ordem indefinida do alvo do SELECT.
CREATE FUNCTION pg_temp.cartao_conta(p_uid uuid, p_action text, p_det jsonb DEFAULT NULL, p_ent text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  v := pg_temp.cartao(p_uid, p_action, p_det, p_ent);
  RETURN v || ' / n=' || (SELECT count(*) FROM public.audit_logs
    WHERE user_id = p_uid AND action IS NOT DISTINCT FROM p_action);
END $h$;

-- ── Fixtures (usuários sintéticos; nada real do banco) ──────────────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a'),  -- U  (fluxo normal)
  ('bbbbbbbb-0000-0000-0000-00000000000b'),  -- R  (rate limit)
  ('cccccccc-0000-0000-0000-00000000000c');  -- D  (details)
SET session_replication_role = origin;

DELETE FROM public.audit_logs
  WHERE user_id IN ('aaaaaaaa-0000-0000-0000-00000000000a',
                    'bbbbbbbb-0000-0000-0000-00000000000b',
                    'cccccccc-0000-0000-0000-00000000000c');

\echo
\echo '── BLOCO A: acao FORA da allowlist nao vira trilha (o defeito) ───────────'
SELECT pg_temp.espera('A1 role_granted NAO grava',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', 'role_granted'), 'OK / n=0');
SELECT pg_temp.espera('A2 settings_changed NAO grava',
  pg_temp.conta('aaaaaaaa-0000-0000-0000-00000000000a', 'settings_changed')::text, '0');
SELECT pg_temp.espera('A3 action vazia NAO grava',
  pg_temp.conta('aaaaaaaa-0000-0000-0000-00000000000a', '')::text, '0');
SELECT pg_temp.espera('A4 action nula NAO grava',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', NULL), 'OK / n=0');
SELECT pg_temp.espera('A5 acao inventada NAO grava',
  pg_temp.conta('aaaaaaaa-0000-0000-0000-00000000000a', 'xpto_qualquer')::text, '0');
SELECT pg_temp.espera('A6 o retorno e neutro (sem erro) para acao barrada',
  pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'role_granted'), 'OK');
SELECT pg_temp.espera('A7 nenhuma linha de A1..A6 sobrou',
  (SELECT count(*)::text FROM public.audit_logs WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), '0');

\echo
\echo '── BLOCO B: acao DA allowlist grava 1 linha, do proprio usuario ──────────'
SELECT pg_temp.espera('B1 client_error grava',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', 'client_error'), 'OK / n=1');
SELECT pg_temp.espera('B2 call_started grava',
  pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'call_started'), 'OK');
SELECT pg_temp.espera('B3 location_sent grava',
  pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'location_sent'), 'OK');
SELECT pg_temp.espera('B4 searchbox_session grava',
  pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'searchbox_session'), 'OK');
SELECT pg_temp.espera('B5 gdpr_deletion_request grava',
  pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'gdpr_deletion_request'), 'OK');
SELECT pg_temp.espera('B6 o autor e o proprio usuario (coluna user_id)',
  (SELECT count(*)::text FROM public.audit_logs
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
       AND action IN ('client_error','call_started','location_sent','searchbox_session','gdpr_deletion_request')), '5');

\echo
\echo '── BLOCO C: login 1x por dia por usuario ─────────────────────────────────'
SELECT pg_temp.espera('C1 primeiro login grava',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', 'login'), 'OK / n=1');
SELECT pg_temp.espera('C2 segundo login do MESMO dia nao grava',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', 'login'), 'OK / n=1');
SELECT pg_temp.espera('C3 outro usuario ainda tem o proprio login',
  pg_temp.cartao_conta('cccccccc-0000-0000-0000-00000000000c', 'login'), 'OK / n=1');

\echo
\echo '── BLOCO D: teto de 4 KB no p_details ────────────────────────────────────'
-- {"blob": "<n>"} ocupa n+12 bytes de texto; 4084 -> 4096 (grava), 4085 -> 4097 (barra)
SELECT pg_temp.espera('D1 details de 4096 bytes grava',
  pg_temp.cartao_conta('cccccccc-0000-0000-0000-00000000000c', 'client_error',
    jsonb_build_object('blob', repeat('a', 4084))), 'OK / n=1');
SELECT pg_temp.espera('D2 details de 4097 bytes NAO grava',
  pg_temp.cartao_conta('cccccccc-0000-0000-0000-00000000000c', 'client_error',
    jsonb_build_object('blob', repeat('b', 4085))), 'OK / n=1');

\echo
\echo '── BLOCO E: rate limit de 60 eventos/min por usuario ─────────────────────'
DO $rate$
DECLARE i int;
BEGIN
  FOR i IN 1..80 LOOP
    PERFORM pg_temp.cartao('bbbbbbbb-0000-0000-0000-00000000000b', 'client_error',
      jsonb_build_object('i', i));
  END LOOP;
END $rate$;
SELECT pg_temp.espera('E1 o usuario nao passa de 60 eventos no mesmo minuto',
  pg_temp.conta('bbbbbbbb-0000-0000-0000-00000000000b', 'client_error')::text, '60');

\echo
\echo '── BLOCO F: INSERT direto em audit_logs pelo cliente segue NEGADO ─────────'
SELECT pg_temp.espera('F1 authenticated nao INSERT direto',
  (pg_temp.operacao('authenticated',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000000a', 'role', 'authenticated'),
    $sql$INSERT INTO public.audit_logs (user_id, action) VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'role_granted')$sql$) LIKE 'ERRO 42501%')::text,
  'true');
SELECT pg_temp.espera('F2 anon nao INSERT direto',
  (pg_temp.operacao('anon', json_build_object('role', 'anon'),
    $sql$INSERT INTO public.audit_logs (action) VALUES ('login')$sql$) LIKE 'ERRO 42501%')::text,
  'true');
SELECT pg_temp.espera('F3 a forja por INSERT direto nao entrou',
  pg_temp.conta('aaaaaaaa-0000-0000-0000-00000000000a', 'role_granted')::text, '0');

\echo
\echo '── BLOCO G: anon/service_role nao gravam pela RPC ────────────────────────'
SELECT pg_temp.operacao('anon', json_build_object('role', 'anon'),
  $sql$select public.log_audit_event('login', NULL, NULL, NULL, 'sql-test-anon')$sql$);
SELECT pg_temp.espera('G1 anon nao gravou pela RPC',
  (SELECT count(*)::text FROM public.audit_logs WHERE user_agent = 'sql-test-anon'), '0');
SELECT pg_temp.operacao('service_role', json_build_object('role', 'service_role'),
  $sql$select public.log_audit_event('login', NULL, NULL, NULL, 'sql-test-svc')$sql$);
SELECT pg_temp.espera('G2 service_role nao gravou pela RPC (sem auth.uid)',
  (SELECT count(*)::text FROM public.audit_logs WHERE user_agent = 'sql-test-svc'), '0');

\echo
\echo '── BLOCO H: p_entity_id invalido nao derruba a gravacao (preservado) ─────'
SELECT pg_temp.cartao('aaaaaaaa-0000-0000-0000-00000000000a', 'client_error', NULL, 'nao-e-uuid');
SELECT pg_temp.espera('H1 entity_id nao-uuid ainda grava (entity_id nulo)',
  (SELECT count(*)::text FROM public.audit_logs
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' AND action = 'client_error' AND entity_id IS NULL),
  '2');

\echo
\echo '── BLOCO I: o ROLLBACK da migration roda e devolve o estado anterior ─────'
-- (as MESMAS statements do cabecalho '-- Rollback (SQL executavel, na ordem)')
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_entity_id_uuid uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;
  IF p_entity_id IS NOT NULL AND p_entity_id <> '' THEN
    BEGIN v_entity_id_uuid := p_entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_entity_id_uuid := NULL; END;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_id_uuid, p_details, p_user_agent);
END;
$function$;

SELECT pg_temp.espera('I1 depois do rollback a acao sensivel volta a gravar',
  pg_temp.cartao_conta('aaaaaaaa-0000-0000-0000-00000000000a', 'role_granted'), 'OK / n=1');

ROLLBACK;

\echo
\echo 'log_audit_event_allowlist OK: fora da allowlist nao grava; dentro grava 1x do dono;'
\echo '  login 1/dia; details<=4KB; 60/min; INSERT direto negado; rollback restaura tudo.'
