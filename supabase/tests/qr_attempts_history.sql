-- qr_attempts_history — prova do historico de tentativas de QR (cartao t_433269a4).
--
-- O QUE PROVA (criterio do cartao):
--   1) a tabela existe com connection_id/status/error_message/created_at, e o
--      status so aceita pending|connected|expired|error (valor invalido e barrado);
--   2) RLS LIGADA e a VISIBILIDADE espelha quem enxerga a conexao: admin/supervisor
--      ve as tentativas da conexao; quem nao enxerga a conexao ve ZERO linhas;
--   3) ESCRITA so pelo service_role: authenticated e anon sao NEGADOS no INSERT
--      (a mensagem de erro sanitizada chega ao suporte pelo service_role, nunca pelo cliente);
--   4) retencao de 30 dias no agendador existente: purge_qr_attempts() apaga o que
--      passou de 30 dias, preserva o que esta dentro da janela e e idempotente;
--   5) cascata: apagada a conexao, o historico dela vai junto;
--   6) ACL: purge_qr_attempts() so o service_role executa.
--
-- COMO RODA (banco LOCAL do cartao, nunca producao):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/qr_attempts_history.sql
-- Roda como postgres, troca para authenticated/anon/service_role dentro do bloco
-- (SET LOCAL ROLE) e termina em ROLLBACK: nenhuma fixture fica no banco.
-- Sem a migration aplicada o teste FALHA ja na 1a consulta (tabela inexistente).
--
-- LIMITACAO: a autorizacao e provada por GRANT + tentativa real com SET ROLE
-- (ACL do Postgres) e o jwt e simulado em request.jwt.claims — nao pelo caminho
-- HTTP/JWT do PostgREST.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  c_conn        constant uuid := '33333333-3333-3333-3333-333333333301';
  c_conn_apagada constant uuid := '33333333-3333-3333-3333-333333333302';
  c_admin       constant uuid := '33333333-3333-3333-3333-333333334401';
  c_agente      constant uuid := '33333333-3333-3333-3333-333333334402';
  c_antiga      constant uuid := '33333333-3333-3333-3333-333333335501';
  c_na_janela   constant uuid := '33333333-3333-3333-3333-333333335502';
  c_erro        constant uuid := '33333333-3333-3333-3333-333333335503';
  v_n       integer;
  v_apagadas integer;
  v_rls     boolean;
BEGIN
  -- ---------------------------------------------------------------- fixtures
  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (id) VALUES (c_admin), (c_agente)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (c_admin, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  SET LOCAL session_replication_role = DEFAULT;

  INSERT INTO public.whatsapp_connections (id, name, phone_number)
  VALUES (c_conn, 'Conexao de teste QR', '+55 11 90000-0001'),
         (c_conn_apagada, 'Conexao descartavel', '+55 11 90000-0002')
  ON CONFLICT (id) DO NOTHING;

  -- ------------------------------------------------------ 1) forma da tabela
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'qr_attempts'
     AND column_name IN ('connection_id', 'status', 'error_message', 'created_at');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'qr_attempts sem as 4 colunas do cartao (achei %)', v_n;
  END IF;

  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.qr_attempts'::regclass;
  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'qr_attempts SEM row level security ligada';
  END IF;

  -- ------------------------------------------------- 2) escrita so service_role
  SET LOCAL ROLE service_role;

  BEGIN
    INSERT INTO public.qr_attempts (connection_id, status)
    VALUES (c_conn, 'pendente');
    RAISE EXCEPTION 'status invalido (pendente) foi aceito';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.qr_attempts (connection_id, status, error_message)
    VALUES (c_conn, 'error', repeat('x', 501));
    RAISE EXCEPTION 'error_message com 501 caracteres foi aceita';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.qr_attempts (id, connection_id, status, error_message, created_at)
  VALUES
    (c_antiga,    c_conn, 'expired',   NULL,                    now() - interval '31 days'),
    (c_na_janela, c_conn, 'connected', NULL,                    now() - interval '29 days'),
    (c_erro,      c_conn, 'error',     'Evolution API: 503 ao gerar o QR', now() - interval '2 minutes');
  RESET ROLE;

  -- ------------------------------------------------- 3) quem enxerga a conexao
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin::text)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.qr_attempts;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'admin (ve a conexao) enxergou % tentativas (esperado 3)', v_n;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_agente::text)::text, true);
  SELECT count(*) INTO v_n FROM public.whatsapp_connections WHERE id = c_conn;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'premissa falsa: usuario sem papel enxergou a conexao (% linhas)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.qr_attempts;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'usuario que nao enxerga a conexao enxergou % tentativas (esperado 0)', v_n;
  END IF;

  BEGIN
    INSERT INTO public.qr_attempts (connection_id, status) VALUES (c_conn, 'pending');
    RAISE EXCEPTION 'authenticated conseguiu INSERT em qr_attempts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.qr_attempts SET status = 'connected' WHERE id = c_na_janela;
    RAISE EXCEPTION 'authenticated conseguiu UPDATE em qr_attempts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.qr_attempts;
    RAISE EXCEPTION 'anon conseguiu SELECT em qr_attempts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  -- ---------------------------------------------- 4) retencao de 30 dias (job)
  IF has_function_privilege('anon', 'public.purge_qr_attempts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em purge_qr_attempts';
  END IF;
  IF has_function_privilege('authenticated', 'public.purge_qr_attempts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE em purge_qr_attempts';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.purge_qr_attempts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role NAO tem EXECUTE em purge_qr_attempts';
  END IF;

  SET LOCAL ROLE service_role;
  v_apagadas := public.purge_qr_attempts();
  RESET ROLE;
  IF v_apagadas <> 1 THEN
    RAISE EXCEPTION 'purge apagou % linhas (esperado 1: so a de 31 dias)', v_apagadas;
  END IF;

  SELECT count(*) INTO v_n FROM public.qr_attempts WHERE id = c_antiga;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'a tentativa de 31 dias sobreviveu a retencao';
  END IF;
  SELECT count(*) INTO v_n FROM public.qr_attempts WHERE id IN (c_na_janela, c_erro);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'retencao apagou linha dentro da janela (% de 2 ficaram)', v_n;
  END IF;

  SET LOCAL ROLE service_role;
  v_apagadas := public.purge_qr_attempts();
  RESET ROLE;
  IF v_apagadas <> 0 THEN
    RAISE EXCEPTION '2a rodada do purge apagou % (esperado 0 — idempotente)', v_apagadas;
  END IF;

  -- ------------------------------------------------------------- 5) cascata
  DELETE FROM public.whatsapp_connections WHERE id = c_conn;
  SELECT count(*) INTO v_n FROM public.qr_attempts WHERE connection_id = c_conn;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'historico de % linhas sobreviveu a conexao apagada', v_n;
  END IF;

  RAISE NOTICE 'qr_attempts_history: suite OK (forma, RLS por conexao, escrita so service_role, retencao 30d, cascata)';
END $$;

ROLLBACK;
