-- close_stale_calls — prova do varredor de telefonia (cartão t_f0dd4666).
--
-- O QUE PROVA (critério do cartão):
--   1) linha presa em 'ringing' (>2 min) vira terminal na rodada; 'answered'
--      (>4 h) vira 'ended'/'failed' com talk_seconds limitado;
--   2) linha recente NÃO é tocada (fresh ringing/answered continuam abertas);
--   3) idempotência: a segunda rodada fecha ZERO linhas;
--   4) permissão: service_role executa; anon e authenticated são NEGADOS.
--
-- COMO RODA (banco LOCAL do cartão, nunca produção):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/close_stale_calls.sql
-- O arquivo roda como postgres, troca para service_role/anon dentro do bloco
-- (SET LOCAL ROLE) e termina em ROLLBACK: nenhuma fixture fica no banco.
-- Sem a migration aplicada o teste FALHA já na 1ª chamada (função inexistente).
--
-- LIMITAÇÃO: aqui a autorização é provada por has_function_privilege + tentativa
-- real com SET ROLE (ANSI ACL do Postgres), não pelo caminho JWT/PostgREST.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_ring_in   constant uuid := '11111111-1111-1111-1111-111111111101';
  c_ring_out  constant uuid := '11111111-1111-1111-1111-111111111102';
  c_ring_fresh constant uuid := '11111111-1111-1111-1111-111111111103';
  c_ans_stale constant uuid := '11111111-1111-1111-1111-111111111104';
  c_ans_fresh constant uuid := '11111111-1111-1111-1111-111111111105';
  c_done      constant uuid := '11111111-1111-1111-1111-111111111106';
  v_closed  integer;
  v_status  text;
  v_reason  text;
  v_ended   timestamptz;
  v_talk    integer;
  v_n       integer;
BEGIN
  -- ---------------------------------------------------------------- fixtures
  INSERT INTO public.calls (id, direction, status, started_at, answered_at, ended_at, end_reason)
  VALUES
    -- presa em 'ringing' (inbound, há 3 min) -> deve virar 'missed'/'timeout'
    (c_ring_in,   'inbound',  'ringing',  now() - interval '3 minutes',  NULL, NULL, NULL),
    -- presa em 'ringing' (outbound, há 10 min) -> deve virar 'ended'/'timeout'
    (c_ring_out,  'outbound', 'ringing',  now() - interval '10 minutes', NULL, NULL, NULL),
    -- recente (30 s): NÃO pode ser tocada
    (c_ring_fresh,'inbound',  'ringing',  now() - interval '30 seconds', NULL, NULL, NULL),
    -- 'answered' preso (atendida há 5 h): termina 'failed', talk_seconds no teto 14400
    (c_ans_stale, 'outbound', 'answered', now() - interval '6 hours', now() - interval '5 hours', NULL, NULL),
    -- 'answered' recente (1 h): NÃO pode ser tocada
    (c_ans_fresh, 'outbound', 'answered', now() - interval '2 hours', now() - interval '1 hour', NULL, NULL),
    -- já terminal: permanece intacta
    (c_done,      'outbound', 'ended',    now() - interval '2 hours', now() - interval '2 hours', now() - interval '1 hour', 'completed')
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------- 1) roda como service_role
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  v_closed := public.close_stale_calls();
  RESET ROLE;

  IF v_closed <> 3 THEN
    RAISE EXCEPTION 'rodada 1: fechou % linhas (esperado 3)', v_closed;
  END IF;

  -- ringing inbound antigo -> missed + timeout
  SELECT status, end_reason, ended_at INTO v_status, v_reason, v_ended
    FROM public.calls WHERE id = c_ring_in;
  IF v_status <> 'missed' OR v_reason <> 'timeout' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'ringing inbound: status=% reason=% ended=%', v_status, v_reason, v_ended;
  END IF;

  -- ringing outbound antigo -> ended + timeout
  SELECT status, end_reason, ended_at INTO v_status, v_reason, v_ended
    FROM public.calls WHERE id = c_ring_out;
  IF v_status <> 'ended' OR v_reason <> 'timeout' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'ringing outbound: status=% reason=% ended=%', v_status, v_reason, v_ended;
  END IF;

  -- answered antigo -> ended + failed + talk_seconds limitado a 14400
  SELECT status, end_reason, ended_at, talk_seconds INTO v_status, v_reason, v_ended, v_talk
    FROM public.calls WHERE id = c_ans_stale;
  IF v_status <> 'ended' OR v_reason <> 'failed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'answered antigo: status=% reason=% ended=%', v_status, v_reason, v_ended;
  END IF;
  IF v_talk <> 14400 THEN
    RAISE EXCEPTION 'answered antigo: talk_seconds=% (esperado teto 14400)', v_talk;
  END IF;

  -- recentes e terminal intactas
  SELECT count(*) INTO v_n FROM public.calls
   WHERE id IN (c_ring_fresh, c_ans_fresh)
     AND ended_at IS NULL
     AND ((id = c_ring_fresh AND status = 'ringing')
       OR (id = c_ans_fresh  AND status = 'answered'));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'linhas recentes foram tocadas (casam=% de 2)', v_n;
  END IF;

  SELECT status, ended_at INTO v_status, v_ended FROM public.calls WHERE id = c_done;
  IF v_status <> 'ended' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'linha terminal alterada: status=% ended=%', v_status, v_ended;
  END IF;

  -- ----------------------------------------------- 2) idempotência: 0 na 2ª vez
  SET LOCAL ROLE service_role;
  v_closed := public.close_stale_calls();
  RESET ROLE;
  IF v_closed <> 0 THEN
    RAISE EXCEPTION 'rodada 2: fechou % linhas (esperado 0 — idempotente)', v_closed;
  END IF;

  -- ------------------------------------------------------- 3) ACL por papel
  IF has_function_privilege('anon', 'public.close_stale_calls()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em close_stale_calls';
  END IF;
  IF has_function_privilege('authenticated', 'public.close_stale_calls()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE em close_stale_calls';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.close_stale_calls()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role NAO tem EXECUTE em close_stale_calls';
  END IF;

  -- tentativa REAL como anon: precisa ser negada
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.close_stale_calls();
    RAISE EXCEPTION 'anon conseguiu executar close_stale_calls';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  RESET ROLE;

  -- tentativa REAL como authenticated: precisa ser negada
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.close_stale_calls();
    RAISE EXCEPTION 'authenticated conseguiu executar close_stale_calls';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  RESET ROLE;

  -- nenhum papel de cliente abriu a função
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.proname = 'close_stale_calls'
     AND p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'];
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'close_stale_calls sem search_path fixo (config divergente)';
  END IF;

  RAISE NOTICE 'close_stale_calls: suite OK (fechou 3, idempotente, anon/authenticated negados, service_role permitido)';
END $$;

ROLLBACK;
