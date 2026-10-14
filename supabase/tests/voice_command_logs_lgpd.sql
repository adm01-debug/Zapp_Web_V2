-- voice_command_logs_lgpd — prova do expurgo/retencao LGPD dos comandos de voz (cartao t_63710b6f)
-- da migration supabase/migrations/20261014020402_voice_command_logs_lgpd.sql
--
-- O QUE PROVA:
--   T1  o titular autenticado grava o PROPRIO registro (RLS de INSERT ja existente);
--   T2  transcricao acima de 2000 caracteres e RECUSADA (check_violation / 23514);
--   T3  resposta acima de 2000 caracteres e RECUSADA (23514);
--   T4  transcricao e resposta com EXATAMENTE 2000 caracteres passam;
--   T5  o titular apaga o PROPRIO registro (policy de DELETE);
--   T6  o titular NAO apaga o registro de OUTRO (USING da policy de DELETE);
--   T7  o titular NAO le o registro de outro; anon nao grava/le/apaga;
--   T8  expurgo por prazo: linha de 100+ dias sai, recente fica, em lote (LIMIT 1 -> 2
--       lotes) e repetivel (2a chamada = 0);
--   T9  authenticated NAO executa o expurgo (42501);
--  T10  guarda de parametro: dias/limite invalidos abortam com 22023;
--  T11  "nao quebra o historico": as CHECK entraram como NOT VALID (convalidated=false);
--  T12  o limite tambem vale para UPDATE.
--
-- COMO RODA: no banco LOCAL descartavel da tarefa, com todas as migrations aplicadas:
--   zapp-db-local psql . <nome-do-banco> < supabase/tests/voice_command_logs_lgpd.sql
-- Tudo dentro de UMA transacao que termina em ROLLBACK (zero efeito colateral, reexecutavel).
-- Os papeis sao EXERCITADOS de verdade: SET LOCAL ROLE + request.jwt.claims.
-- VERMELHO esperado sem a migration (DROP FUNCTION/POLICY antes de rodar): T5/T6/T7/T8
-- falham (42883 em public.purge_voice_command_logs; o DELETE do proprio deixa a linha).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(p_cond boolean, p_msg text) RETURNS void
LANGUAGE plpgsql AS $ok$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END
$ok$;

-- Fixture: dois titulares sinteticos no auth.users (a FK voice_command_logs_user_id_fkey
-- aponta para auth.users(id)). session_replication_role=replica evita os gatilhos de
-- profile ao inserir em auth.users.
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111'),
  ('bbbbbbbb-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;
SET session_replication_role = default;

-- ---------------------------------------------------------------------------
-- Bloco 1 — como o titular A (authenticated + claims)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- T1 — grava o proprio (permitido). Se falhar, o teste morre aqui.
INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
VALUES ('aaaaaaaa-1111-1111-1111-111111111111', 'abrir a caixa de entrada', 'navegar', 'feito');

-- T2 / T3 — acima do limite: recusado
DO $$
BEGIN
  BEGIN
    INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
    VALUES ('aaaaaaaa-1111-1111-1111-111111111111', repeat('x', 2001), 'navegar', 'ok');
    RAISE EXCEPTION 'FALHOU: T2 transcricao de 2001 caracteres foi aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
    VALUES ('aaaaaaaa-1111-1111-1111-111111111111', 'ok', 'navegar', repeat('y', 2001));
    RAISE EXCEPTION 'FALHOU: T3 resposta de 2001 caracteres foi aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- T4 — exatamente no limite: passa
INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
VALUES ('aaaaaaaa-1111-1111-1111-111111111111', repeat('a', 2000), 'navegar', repeat('b', 2000));

-- T5 — apaga o proprio (permitido pela policy de DELETE)
DELETE FROM public.voice_command_logs
 WHERE user_id = 'aaaaaaaa-1111-1111-1111-111111111111';

-- Fixture do T6/T7: registro do titular B, gravado como owner (fora de RLS)
RESET ROLE;
INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
VALUES ('bbbbbbbb-2222-2222-2222-222222222222', 'registro do outro titular', 'navegar', 'nao mexer');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- T6 / T7 — nao enxerga nem apaga o registro de outro titular
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.voice_command_logs
   WHERE user_id = 'bbbbbbbb-2222-2222-2222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: T7 o titular A leu % registro(s) de B', n; END IF;

  DELETE FROM public.voice_command_logs
   WHERE user_id = 'bbbbbbbb-2222-2222-2222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: T6 o titular A apagou % registro(s) de B', n; END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.voice_command_logs
      WHERE user_id = 'bbbbbbbb-2222-2222-2222-222222222222') = 1,
    'T6: o registro do titular B nao podia ter sido apagado');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.voice_command_logs
      WHERE user_id = 'aaaaaaaa-1111-1111-1111-111111111111') = 0,
    'T5: o titular A deveria ter apagado os proprios registros');
END $$;

-- ---------------------------------------------------------------------------
-- Bloco 2 — anon nao anda
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
    VALUES ('aaaaaaaa-1111-1111-1111-111111111111', 'o', 'navegar', 'ok');
    RAISE EXCEPTION 'FALHOU: T7 anon gravou um log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.voice_command_logs;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: T7 anon leu % registro(s) do log', n; END IF;

  BEGIN
    DELETE FROM public.voice_command_logs;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: T7 anon apagou % registro(s)', n; END IF;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Bloco 3 — expurgo por prazo (service_role)
-- ---------------------------------------------------------------------------
INSERT INTO public.voice_command_logs (user_id, transcript, action, response, created_at) VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 'vencida 1', 'navegar', 'ok', now() - interval '100 days'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'vencida 2', 'navegar', 'ok', now() - interval '120 days'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'recente',  'navegar', 'ok', now());

-- T9 — authenticated NAO executa o expurgo
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.purge_voice_command_logs(90, 100);
    RAISE EXCEPTION 'FALHOU: T9 authenticated executou o expurgo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- T8 / T10 — service_role executa: em lote, repetivel, com guarda de parametro
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE r jsonb;
BEGIN
  r := public.purge_voice_command_logs(90, 1);
  IF (r->>'deleted')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: T8 esperava apagar 2 vencidas, apagou %', r->>'deleted';
  END IF;
  IF (r->>'batches')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: T8 esperava 2 lotes com LIMIT 1, veio %', r->>'batches';
  END IF;
  r := public.purge_voice_command_logs(90, 1);
  IF (r->>'deleted')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: T8 2a chamada deveria apagar 0, apagou %', r->>'deleted';
  END IF;

  BEGIN
    PERFORM public.purge_voice_command_logs(0, 100);
    RAISE EXCEPTION 'FALHOU: T10 dias=0 deveria abortar';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.purge_voice_command_logs(90, 999999);
    RAISE EXCEPTION 'FALHOU: T10 limite fora da faixa deveria abortar';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.voice_command_logs WHERE transcript = 'recente') = 1,
    'T8: a linha recente nao podia ter sido expurgada');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.voice_command_logs WHERE transcript LIKE 'vencida%') = 0,
    'T8: as linhas vencidas deveriam ter saido');
END $$;

-- ---------------------------------------------------------------------------
-- Bloco 4 — o limite nao quebra o historico e vale para UPDATE
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.voice_command_logs'::regclass
       AND conname IN ('voice_command_logs_transcript_length_check',
                       'voice_command_logs_response_length_check')
       AND convalidated), 'T11: as CHECK deveriam estar NOT VALID (nao revalidam o historico)');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.voice_command_logs'::regclass
        AND conname IN ('voice_command_logs_transcript_length_check',
                        'voice_command_logs_response_length_check')) = 2,
    'T11: as duas CHECK precisam existir');
END $$;

-- T12 — o limite tambem barra o UPDATE (rodado como owner: a tabela nao tem policy de
-- UPDATE, entao para o titular a RLS simplesmente nao afeta linha nenhuma; a CHECK em si
-- e independente de RLS e e o que aqui se prova).
INSERT INTO public.voice_command_logs (user_id, transcript, action, response)
VALUES ('aaaaaaaa-1111-1111-1111-111111111111', 'curto', 'navegar', 'ok');
DO $$
BEGIN
  BEGIN
    UPDATE public.voice_command_logs SET transcript = repeat('z', 2001)
     WHERE user_id = 'aaaaaaaa-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'FALHOU: T12 UPDATE para 2001 caracteres passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

SELECT 'OK — voice_command_logs_lgpd: todas as provas (T1..T12) passaram' AS resultado;

ROLLBACK;
