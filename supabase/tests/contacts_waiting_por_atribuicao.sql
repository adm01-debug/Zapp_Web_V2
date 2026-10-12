-- Teste SQL do gatilho public.sync_conversation_status_with_assignment (cartao t_3a0ad736).
--
-- O que prova (contrato do ADR-005, passo 4 -- "Aguardando acompanha a atribuicao"):
--   C1  com a flag inbox.status-fsm DESLIGADA, tirar o responsavel nao muda nada;
--   C2  com a flag LIGADA, tirar o responsavel de um contato 'open' -> 'waiting',
--       carimbando conversation_status_changed_at;
--   C3  com a flag LIGADA, atribuir responsavel a um contato 'waiting' -> 'open';
--   C4  estado terminal ('resolved'/'archived') NAO muda ao mexer na atribuicao;
--   C5  o backfill da migration (flag ligada + open + sem responsavel + com mensagem
--       -> waiting) respeita a flag e e idempotente: com flag desligada nao mexe em
--       nada; com flag ligada mexe 1 vez; a segunda rodada preserva um carimbo
--       sentinela distinto.
--
-- PAPEL REAL: os UPDATE rodam como `authenticated` (admin sintetico) com JWT em
-- request.jwt.claims -- o caminho do PostgREST, nunca como postgres (que ignora
-- RLS e GRANT). Cada bloco confere o estado no fim.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local up . <conjunto>
--   c=$(docker ps --format '{{.Names}}' | grep -E '^supabase-<conjunto>-<conjunto>-database-' | head -1)
--   docker cp supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql "$c:/tmp/20261011174630_contacts_waiting_por_atribuicao.sql"
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql
--
-- VERMELHO sem a migration: a chave inbox.status-fsm nao existe e C2/C3 ficam em
-- 'open' -- a suite falha com EXCEPTION. VERMELHO sem o predicado da flag no
-- backfill: C5 muda v_c_backfill para 'waiting' mesmo com a flag desligada.
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final: nao sobra linha no banco.
-- Sem EXCEPTION = suite verde.
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
  v_flag_on    boolean;
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

  -- A flag existe, mas nasce DESLIGADA quando a migration cria a chave.
  SELECT enabled INTO v_flag_on FROM public.feature_flags WHERE key = 'inbox.status-fsm';
  IF v_flag_on IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: a chave inbox.status-fsm nao existe em feature_flags';
  END IF;
  IF v_flag_on IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'C0 FALHOU: flag nova deveria nascer desligada, veio %', v_flag_on;
  END IF;
  v_ok := v_ok + 1;

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

  RAISE NOTICE 'contacts_waiting_por_atribuicao: suite OK (C0 flag nasce off, C1 flag off, C2 tira responsavel, C3 atribui, C4 terminal) -- % grupo(s) verificado(s)', v_ok;
END $waiting_attr$;

RESET ROLE;

-- ---------------------------------------------------- C5 backfill REAL respeita flag + idempotente
-- Este bloco reexecuta a migration real dentro da transacao do teste. Sem o
-- predicado da flag no UPDATE de backfill da migration, o primeiro \i abaixo
-- muda v_c_backfill para 'waiting' mesmo com a flag desligada e a suite fica vermelha.
UPDATE public.feature_flags SET enabled = false WHERE key = 'inbox.status-fsm';
\i /tmp/20261011174630_contacts_waiting_por_atribuicao.sql

DO $waiting_attr_backfill_off$
DECLARE
  v_c_backfill uuid := '33333333-3333-3333-3333-3333333333c5';
  v_t_old      timestamptz := '2026-01-01T00:00:00Z';
  v_status     text;
  v_changed    timestamptz;
BEGIN
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed
    FROM public.contacts WHERE id = v_c_backfill;
  IF v_status <> 'open' OR v_changed IS DISTINCT FROM v_t_old THEN
    RAISE EXCEPTION 'C5 FALHOU: migration real com flag desligada alterou o estado (% / %)', v_status, v_changed;
  END IF;
  RAISE NOTICE 'contacts_waiting_por_atribuicao: C5 flag desligada OK (migration real nao mexeu no backfill)';
END $waiting_attr_backfill_off$;

UPDATE public.feature_flags SET enabled = true WHERE key = 'inbox.status-fsm';
\i /tmp/20261011174630_contacts_waiting_por_atribuicao.sql

DO $waiting_attr_backfill_on$
DECLARE
  v_c_backfill uuid := '33333333-3333-3333-3333-3333333333c5';
  v_t_old      timestamptz := '2026-01-01T00:00:00Z';
  v_status     text;
  v_changed_1  timestamptz;
BEGIN
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed_1
    FROM public.contacts WHERE id = v_c_backfill;
  IF v_status <> 'waiting' OR v_changed_1 IS NULL OR v_changed_1 <= v_t_old THEN
    RAISE EXCEPTION 'C5 FALHOU: migration real com flag ligada esperava waiting carimbado e veio % / %', v_status, v_changed_1;
  END IF;
  PERFORM set_config('zapp.test.c5_changed_1', v_changed_1::text, true);
  RAISE NOTICE 'contacts_waiting_por_atribuicao: C5 flag ligada OK (migration real aplicou o backfill)';
END $waiting_attr_backfill_on$;

-- Segunda rodada: grava um carimbo sentinela distinto antes de reexecutar. Se o
-- backfill reescrever linha que ja esta waiting, a suite fica vermelha.
ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;
UPDATE public.contacts
   SET conversation_status_changed_at = '2026-02-02T00:00:00Z'
 WHERE id = '33333333-3333-3333-3333-3333333333c5';
ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;

\i /tmp/20261011174630_contacts_waiting_por_atribuicao.sql

DO $waiting_attr_backfill_idempotent$
DECLARE
  v_c_backfill uuid := '33333333-3333-3333-3333-3333333333c5';
  v_status     text;
  v_changed    timestamptz;
  v_sentinel   timestamptz := '2026-02-02T00:00:00Z';
BEGIN
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed
    FROM public.contacts WHERE id = v_c_backfill;
  IF v_status <> 'waiting' OR v_changed IS DISTINCT FROM v_sentinel THEN
    RAISE EXCEPTION 'C5 FALHOU: segunda execucao da migration real alterou o estado (% / % vs sentinela %)',
      v_status, v_changed, v_sentinel;
  END IF;
  RAISE NOTICE 'contacts_waiting_por_atribuicao: C5 idempotencia OK (migration real preservou o carimbo sentinela)';
END $waiting_attr_backfill_idempotent$;

ROLLBACK;
