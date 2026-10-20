-- scripts/db-tests/02-fsm-transitions.sql
-- Usa contato de teste sintetico criado e destruido no proprio script

DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_t1 timestamptz;
  v_t2 timestamptz;
  v_status text;
BEGIN
  -- Setup: inserir contato de teste
  INSERT INTO contacts (id, name, conversation_status)
  VALUES (v_id, 'TEST_FSM_DELETE_ME', 'open');

  -- FSM-01: open->open no-op (changed_at nao muda)
  SELECT conversation_status_changed_at INTO v_t1 FROM contacts WHERE id = v_id;
  PERFORM set_conversation_status(v_id, 'open', NULL);
  SELECT conversation_status_changed_at INTO v_t2 FROM contacts WHERE id = v_id;
  IF v_t1 IS NOT DISTINCT FROM v_t2 THEN
    RAISE NOTICE 'PASS|02-FSM-01: open->open no-op preserva changed_at|ok';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-01: open->open no-op|changed_at mudou';
  END IF;

  -- FSM-02: open->resolved (valida + changed_at atualiza)
  SELECT conversation_status_changed_at INTO v_t1 FROM contacts WHERE id = v_id;
  PERFORM pg_sleep(0.01);
  PERFORM set_conversation_status(v_id, 'resolved', 'test');
  SELECT conversation_status, conversation_status_changed_at INTO v_status, v_t2 FROM contacts WHERE id = v_id;
  IF v_status = 'resolved' AND v_t2 > v_t1 THEN
    RAISE NOTICE 'PASS|02-FSM-02: open->resolved OK|status=resolved changed_at atualizado';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-02: open->resolved|status=% t1=% t2=%', v_status, v_t1, v_t2;
  END IF;

  -- FSM-03: resolved->open (critico para E2E fixture)
  PERFORM set_conversation_status(v_id, 'open', NULL);
  SELECT conversation_status INTO v_status FROM contacts WHERE id = v_id;
  IF v_status = 'open' THEN
    RAISE NOTICE 'PASS|02-FSM-03: resolved->open OK|status=open';
  ELSE
    RAISE NOTICE 'FAIL|02-FSM-03: resolved->open|status=%', v_status;
  END IF;

  -- FSM-04: waiting->archived INVALIDA (deve rejeitar)
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

  -- Cleanup
  DELETE FROM conversation_closures WHERE contact_id = v_id;
  DELETE FROM contacts WHERE id = v_id;
END $$;
