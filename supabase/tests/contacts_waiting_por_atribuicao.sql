-- Teste SQL do gatilho public.sync_conversation_status_with_assignment (cartao t_3a0ad736).
--
-- O que prova (contrato do ADR-005, passo 4 -- "Aguardando acompanha a atribuicao"):
--   C1  com a flag inbox.status-fsm DESLIGADA, tirar o responsavel nao muda nada;
--   C2  com a flag LIGADA, tirar o responsavel de um contato 'open' -> 'waiting',
--       carimbando conversation_status_changed_at;
--   C3  com a flag LIGADA, atribuir responsavel a um contato 'waiting' -> 'open';
--   C4  estado terminal ('resolved'/'archived') NAO muda ao mexer na atribuicao;
--   C5  o backfill da migration (open + sem responsavel + com mensagem -> waiting)
--       e idempotente: a segunda rodada nao mexe em nenhuma linha nem reescreve
--       conversation_status_changed_at.
--
-- PAPEL REAL: os UPDATE rodam como `authenticated` (admin sintetico) com JWT em
-- request.jwt.claims -- o caminho do PostgREST, nunca como postgres (que ignora
-- RLS e GRANT). Cada bloco confere o estado no fim.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql
--
-- VERMELHO sem a migration: a chave inbox.status-fsm nao existe e C2/C3 ficam em
-- 'open' -- a suite falha com EXCEPTION. Cria dados SINTETICOS e desfaz tudo no
-- ROLLBACK final: nao sobra linha no banco. Sem EXCEPTION = suite verde.
BEGIN;

DO $waiting_attr$
DECLARE
  v_user_admin uuid := '11111111-1111-1111-1111-1111111111a1';
  v_profile    uuid;
  v_c_off      uuid := '33333333-3333-3333-3333-3333333333c0'; -- C1: open + responsavel (flag desligada)
  v_c_remove   uuid := '33333333-3333-3333-3333-3333333333c1'; -- open + responsavel
  v_c_assign   uuid := '33333333-3333-3333-3333-3333333333c2'; -- waiting + sem responsavel
  v_c_resolved uuid := '33333333-3333-3333-3333-3333333333c3'; -- resolved + responsavel
  v_c_archived uuid := '33333333-3333-3333-3333-3333333333c4'; -- archived + responsavel
  v_c_backfill uuid := '33333333-3333-3333-3333-3333333333c5'; -- open + sem responsavel + msg
  v_msg        uuid := '44444444-4444-4444-4444-444444444401';
  v_t_old      timestamptz := '2026-01-01T00:00:00Z';
  v_status     text;
  v_changed    timestamptz;
  v_changed_1  timestamptz;
  v_rows       int;
  v_ok         int := 0;
BEGIN
  -- ------------------------------------------------------------------ fixture
  INSERT INTO auth.users (id, email) VALUES (v_user_admin, 'waiting-attr-admin@local.test');

  -- O gatilho on_auth_user_created cria o perfil; o upsert cobre os dois mundos.
  INSERT INTO public.profiles (user_id, name) VALUES (v_user_admin, 'Admin sintetico')
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_user_admin;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_admin, 'admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.contacts (id, name, phone, assigned_to, conversation_status, conversation_status_changed_at) VALUES
    (v_c_off,      'C1 open com resp. (flag off)', '5511000000910', v_profile, 'open',     v_t_old),
    (v_c_remove,   'C2 open com responsavel',    '5511000000911', v_profile, 'open',     v_t_old),
    (v_c_assign,   'C3 waiting sem responsavel', '5511000000912', NULL,      'waiting',  v_t_old),
    (v_c_resolved, 'C4 resolved com responsavel','5511000000913', v_profile, 'resolved', v_t_old),
    (v_c_archived, 'C4 archived com responsavel','5511000000914', v_profile, 'archived', v_t_old),
    (v_c_backfill, 'C5 open sem resp. com msg',  '5511000000915', NULL,      'open',     v_t_old);

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
    VALUES (v_msg, v_c_backfill, 'contact', 'mensagem do contato', 'text', v_t_old);

  -- A flag nasce LIGADA (a propria migration insere a linha).
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'inbox.status-fsm') THEN
    RAISE EXCEPTION 'fixture invalida: a chave inbox.status-fsm nao existe em feature_flags';
  END IF;

  -- ---------------------------------------------------- C1 flag DESLIGADA
  UPDATE public.feature_flags SET enabled = false WHERE key = 'inbox.status-fsm';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.contacts SET assigned_to = NULL WHERE id = v_c_off;
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_off;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'C1 FALHOU: flag desligada e o estado virou % (esperava open)', v_status;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------- C2 flag LIGADA: tira responsavel
  UPDATE public.feature_flags SET enabled = true WHERE key = 'inbox.status-fsm';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.contacts SET assigned_to = NULL WHERE id = v_c_remove;
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed
    FROM public.contacts WHERE id = v_c_remove;
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'C2 FALHOU: esperava waiting e veio %', v_status;
  END IF;
  IF v_changed IS NULL OR v_changed <= v_t_old THEN
    RAISE EXCEPTION 'C2 FALHOU: conversation_status_changed_at nao foi carimbado (%)', v_changed;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------- C3 flag LIGADA: atribui
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.contacts SET assigned_to = v_profile WHERE id = v_c_assign;
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_assign;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'C3 FALHOU: esperava open e veio %', v_status;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------- C4 estado terminal nao muda
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.contacts SET assigned_to = NULL WHERE id IN (v_c_resolved, v_c_archived);
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_resolved;
  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'C4 FALHOU: resolved virou % ao tirar o responsavel', v_status;
  END IF;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_archived;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'C4 FALHOU: archived virou % ao tirar o responsavel', v_status;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------- C5 backfill idempotente
  -- Mesmo statement do backfill da migration 20261011174630_contacts_waiting_por_atribuicao.sql
  -- (aqui limitado ao contato de fixture para nao tocar o resto do banco).
  UPDATE public.contacts
     SET conversation_status = 'waiting', conversation_status_changed_at = now()
   WHERE id = v_c_backfill
     AND conversation_status = 'open'
     AND assigned_to IS NULL
     AND EXISTS (SELECT 1 FROM public.messages m WHERE m.contact_id = public.contacts.id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'C5 FALHOU: o backfill esperava mexer em 1 linha e mexeu em %', v_rows;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed_1
    FROM public.contacts WHERE id = v_c_backfill;
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'C5 FALHOU: apos o backfill esperava waiting e veio %', v_status;
  END IF;

  -- Segunda rodada: nao ha linha no predicado (ja virou waiting) -> 0 linhas.
  UPDATE public.contacts
     SET conversation_status = 'waiting', conversation_status_changed_at = now()
   WHERE id = v_c_backfill
     AND conversation_status = 'open'
     AND assigned_to IS NULL
     AND EXISTS (SELECT 1 FROM public.messages m WHERE m.contact_id = public.contacts.id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'C5 FALHOU: a segunda rodada do backfill mexeu em % linha(s)', v_rows;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed
    FROM public.contacts WHERE id = v_c_backfill;
  IF v_status <> 'waiting' OR v_changed IS DISTINCT FROM v_changed_1 THEN
    RAISE EXCEPTION 'C5 FALHOU: a segunda rodada alterou o estado (% / % vs %)',
      v_status, v_changed, v_changed_1;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'contacts_waiting_por_atribuicao: suite OK (C1 flag off, C2 tira responsavel, C3 atribui, C4 terminal, C5 backfill idempotente) -- % grupo(s) verificado(s)', v_ok;
END $waiting_attr$;

ROLLBACK;
