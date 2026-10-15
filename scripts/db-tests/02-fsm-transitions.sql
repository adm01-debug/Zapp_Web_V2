-- scripts/db-tests/02-fsm-transitions.sql
-- Usa contato de teste sintetico criado e destruido no proprio script.
--
-- FSM-02 compara conversation_status_changed_at ENTRE TRANSAÇÕES (t_6dafc78a,
-- refazer 1): changed_at é NOW() e NOW() congela dentro de uma transação só,
-- então ler t1, transicionar e reler DENTRO do mesmo bloco DO sempre devolve
-- t2 = t1 (falso-vermelho). Cada bloco DO abaixo é uma transação própria em
-- autocommit do psql; o id do contato de teste viaja entre blocos na TEMP
-- TABLE fsm_state (escopo de sessão, sobrevive ao COMMIT). O valor comparado
-- em FSM-02 (t1) foi gravado numa transação ANTERIOR, então t2 > t1 de verdade.

-- Bloco 0: setup — cria o contato de teste (phone sintetico: NOT NULL no schema)
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS fsm_state(id uuid PRIMARY KEY);
  DELETE FROM fsm_state;
  INSERT INTO contacts (id, name, phone, conversation_status)
  VALUES (v_id, 'TEST_FSM_DELETE_ME', '5500000000000', 'open');
  INSERT INTO fsm_state(id) VALUES (v_id);
  RAISE NOTICE 'PASS|02-FSM-00: fixture criada|ok';
END $$;

-- FSM-01: open->open no-op (changed_at nao muda)
DO $$
DECLARE
  v_id uuid;
  v_t1 timestamptz;
  v_t2 timestamptz;
BEGIN
  SELECT id INTO v_id FROM fsm_state LIMIT 1;
  SELECT conversation_status_changed_at INTO v_t1 FROM contacts WHERE id = v_id;
  PERFORM set_conversation_status(v_id, 'open', NULL);
  SELECT conversation_status_changed_at INTO v_t2 FROM contacts WHERE id = v_id;
  IF v_t1 IS NOT DISTINCT FROM v_t2 THEN
    RAISE NOTICE 'PASS|02-FSM-01: open->open no-op preserva changed_at|ok';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-01: open->open no-op|changed_at mudou';
  END IF;
END $$;

-- FSM-02: open->resolved (valida + changed_at atualiza ENTRE TRANSAÇÕES)
DO $$
DECLARE
  v_id uuid;
  v_t1 timestamptz;
  v_t2 timestamptz;
  v_status text;
BEGIN
  SELECT id INTO v_id FROM fsm_state LIMIT 1;
  SELECT conversation_status_changed_at INTO v_t1 FROM contacts WHERE id = v_id;
  PERFORM set_conversation_status(v_id, 'resolved', 'test');
  SELECT conversation_status, conversation_status_changed_at INTO v_status, v_t2 FROM contacts WHERE id = v_id;
  IF v_status = 'resolved' AND v_t2 > v_t1 THEN
    RAISE NOTICE 'PASS|02-FSM-02: open->resolved OK|status=resolved changed_at atualizado';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-02: open->resolved|status=% t1=% t2=%', v_status, v_t1, v_t2;
  END IF;
END $$;

-- FSM-03: resolved->open (critico para E2E fixture)
DO $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  SELECT id INTO v_id FROM fsm_state LIMIT 1;
  PERFORM set_conversation_status(v_id, 'open', NULL);
  SELECT conversation_status INTO v_status FROM contacts WHERE id = v_id;
  IF v_status = 'open' THEN
    RAISE NOTICE 'PASS|02-FSM-03: resolved->open OK|status=open';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-03: resolved->open|status=%', v_status;
  END IF;
END $$;

-- FSM-04: waiting->archived INVALIDA (deve rejeitar)
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM fsm_state LIMIT 1;
  BEGIN
    PERFORM set_conversation_status(v_id, 'waiting', NULL);
    PERFORM set_conversation_status(v_id, 'archived', NULL);
    RAISE NOTICE 'FAIL|02-FSM-04: waiting->archived deveria rejeitar|aceitou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%invalid transition%' THEN
      RAISE NOTICE 'PASS|02-FSM-04: waiting->archived rejeitado|%', SQLERRM;
    ELSE
      RAISE NOTICE 'FAIL|02-FSM-04: erro inesperado|%', SQLERRM;
    END IF;
  END;
END $$;

-- Bloco final: cleanup — remove o contato de teste e os closures dele
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM fsm_state LIMIT 1;
  DELETE FROM conversation_closures WHERE contact_id = v_id;
  DELETE FROM contacts WHERE id = v_id;
  DROP TABLE IF EXISTS fsm_state;
  RAISE NOTICE 'PASS|02-FSM-99: cleanup OK|ok';
END $$;
