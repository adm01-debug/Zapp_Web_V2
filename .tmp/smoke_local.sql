-- Smoke no banco LOCAL da tarefa (schema real, gatilhos e policies reais).
-- Prova que public.delete_message funciona contra a estrutura de verdade e que os
-- gatilhos de guarda existentes (provenance/delivery) nao barram o UPDATE da RPC.
-- Termina limpando as linhas de fixture criadas aqui.
\set ON_ERROR_STOP on

SET session_replication_role = replica;
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('b1000000-0000-0000-0000-000000000001','authenticated','authenticated','smoke-u1@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('d1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','SMOKE u1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('e1000000-0000-0000-0000-000000000001','SMOKE contato','+5500000000000','d1000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.messages (id, contact_id, sender, content, message_type, agent_id, status) VALUES
  ('a1000000-0000-0000-0000-0000000000f1','e1000000-0000-0000-0000-000000000001','agent','smoke texto original','text','d1000000-0000-0000-0000-000000000001','sent')
ON CONFLICT (id) DO NOTHING;
SET session_replication_role = origin;

DO $$
DECLARE v_ok boolean; v_row public.messages%ROWTYPE; v_before timestamptz;
BEGIN
  SELECT updated_at INTO v_before FROM public.messages WHERE id='a1000000-0000-0000-0000-0000000000f1';
  PERFORM set_config('request.jwt.claims', json_build_object('sub','b1000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_ok := public.delete_message('a1000000-0000-0000-0000-0000000000f1');
  RESET ROLE;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'SMOKE FALHOU: retorno %', v_ok; END IF;
  SELECT * INTO v_row FROM public.messages WHERE id='a1000000-0000-0000-0000-0000000000f1';
  IF v_row.content IS DISTINCT FROM 'smoke texto original' THEN
    RAISE EXCEPTION 'SMOKE FALHOU: content alterado para %', v_row.content;
  END IF;
  IF v_row.is_deleted IS NOT TRUE OR v_row.deleted_by <> 'd1000000-0000-0000-0000-000000000001' OR v_row.deleted_at IS NULL THEN
    RAISE EXCEPTION 'SMOKE FALHOU: rastro incompleto (is_deleted=%, deleted_by=%, deleted_at=%)', v_row.is_deleted, v_row.deleted_by, v_row.deleted_at;
  END IF;
  IF v_row.sender <> 'agent' OR v_row.agent_id <> 'd1000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'SMOKE FALHOU: campos de proveniencia mudaram';
  END IF;
  RAISE NOTICE 'SMOKE OK (banco local real): apagou, rastro gravado, content/proveniencia intactos; updated_at antes=%', v_before;
END $$;

-- limpeza da fixture
DELETE FROM public.messages WHERE id='a1000000-0000-0000-0000-0000000000f1';
DELETE FROM public.contacts WHERE id='e1000000-0000-0000-0000-000000000001';
DELETE FROM public.profiles WHERE id='d1000000-0000-0000-0000-000000000001';
SET session_replication_role = replica;
DELETE FROM auth.users WHERE id='b1000000-0000-0000-0000-000000000001';
SET session_replication_role = origin;
