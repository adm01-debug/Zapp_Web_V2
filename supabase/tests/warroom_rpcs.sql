-- warroom_rpcs.sql — prova das RPCs do War Room (R2-MOD-030)
--   public.warroom_agent_today(p_date date)  → desempenho do dia por agente ativo
--   public.warroom_queue_stats()             → episodio em andamento por fila ativa
--
-- COMO RODAR (banco LOCAL da tarefa, sessao postgres — o mesmo caminho do hermes-db-migrar):
--   zapp-db-local psql . v2-<id> < supabase/tests/warroom_rpcs.sql
--
-- Por que postgres e nao service_role: a suite cria as PROPRIAS fixtures e TROCA DE PAPEL
--   (SET LOCAL ROLE authenticated / anon) para exercitar a fronteira de EXECUTE e o gate
--   de staff. Isso exige ser dono das tabelas public (DISABLE TRIGGER) e poder assumir os
--   papeis do Supabase. service_role nao prova fronteira (BYPASSRLS) e anon nao cria fixture.
--   Nada roda em producao: tudo em transacao com ROLLBACK no fim.
-- Por que DISABLE TRIGGER: os gatilhos de negocio (auto-atribuicao de contato, FSM de
--   conversation_status, gamificacao/crm-sync de closure, auditoria, sincronizacao de
--   papel) mutariam o cenario medido. Desabilitados so nesta transacao revertida.
--
-- VERMELHO ANTES: sem as 2 funcoes criadas pela migration, T5 ja para em 42883
--   ("function public.warroom_agent_today(date) does not exist") — a suite prova o defeito
--   (War Room calculando no cliente, com corte de 1000 linhas do PostgREST) e a correcao.

BEGIN;

ALTER TABLE public.profiles              DISABLE TRIGGER USER;
ALTER TABLE public.user_roles            DISABLE TRIGGER USER;
ALTER TABLE public.queues                DISABLE TRIGGER USER;
ALTER TABLE public.contacts              DISABLE TRIGGER USER;
ALTER TABLE public.conversation_sla      DISABLE TRIGGER USER;
ALTER TABLE public.conversation_closures DISABLE TRIGGER USER;
ALTER TABLE public.csat_surveys          DISABLE TRIGGER USER;

-- Usuarios de teste. Os gatilhos de auth.users criam os profiles sozinhos (nao sou dono
-- de auth.users para desliga-los); o nome/papel reais sao ajustados no bloco abaixo.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaa5-0000-4000-8000-000000000005', 'ana.agente@warroom.local',   '{"name":"Ana Agente"}'::jsonb),
  ('aaaaaaa7-0000-4000-8000-000000000007', 'bruno.admin@warroom.local',  '{"name":"Bruno Admin"}'::jsonb),
  ('aaaaaaa9-0000-4000-8000-000000000009', 'carla.inativa@warroom.local','{"name":"Carla Inativa"}'::jsonb);

DO $$
DECLARE
  -- identidades fixas (uuid deterministico: nada depende do banco real)
  c_agent_user    uuid := 'aaaaaaa5-0000-4000-8000-000000000005';
  c_admin_user    uuid := 'aaaaaaa7-0000-4000-8000-000000000007';
  c_inactive_user uuid := 'aaaaaaa9-0000-4000-8000-000000000009';
  c_queue_a       uuid := 'aaaaaaa1-0000-4000-8000-000000000001';  -- Suporte (volume)
  c_queue_b       uuid := 'aaaaaaa2-0000-4000-8000-000000000002';  -- Comercial (SLA)
  c_queue_zombie  uuid := 'aaaaaaa3-0000-4000-8000-000000000003';  -- inativa
  c_sla_cfg       uuid := 'aaaaaaab-0000-4000-8000-00000000000b';  -- prazo 1a resposta = 10 min
  c_b_wait        uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  c_b_breach      uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  c_b_ok          uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  c_b_resolved    uuid := 'bbbbbbbb-0000-4000-8000-000000000004';
  c_b_deleted     uuid := 'bbbbbbbb-0000-4000-8000-000000000005';
  c_b_zombie      uuid := 'bbbbbbbb-0000-4000-8000-000000000006';
  v_agent_prof    uuid;
  v_admin_prof    uuid;
  v_inactive_prof uuid;
  v_today         date;
  v_t0            timestamptz;
  v_agents        jsonb;
  v_queues        jsonb;
  v_prev          jsonb;
  v_row           jsonb;
  v_arr           jsonb;
  v_denied        int := 0;
BEGIN
  -- ---------------------------------------------------------------- fixtures
  SELECT id INTO v_agent_prof    FROM public.profiles WHERE user_id = c_agent_user;
  SELECT id INTO v_admin_prof    FROM public.profiles WHERE user_id = c_admin_user;
  SELECT id INTO v_inactive_prof FROM public.profiles WHERE user_id = c_inactive_user;

  IF v_agent_prof IS NULL OR v_admin_prof IS NULL OR v_inactive_prof IS NULL THEN
    RAISE EXCEPTION 'fixture: auth.users nao gerou os 3 profiles';
  END IF;

  UPDATE public.profiles SET name = 'Ana Agente',    is_active = true,  max_chats = 7 WHERE id = v_agent_prof;
  UPDATE public.profiles SET name = 'Bruno Admin',   is_active = true,  max_chats = 5 WHERE id = v_admin_prof;
  UPDATE public.profiles SET name = 'Carla Inativa', is_active = false, max_chats = 5 WHERE id = v_inactive_prof;

  INSERT INTO public.user_roles (id, user_id, role) VALUES
    (md5('wr-role-1')::uuid, c_agent_user,    'agent'),
    (md5('wr-role-2')::uuid, c_admin_user,    'admin'),
    (md5('wr-role-3')::uuid, c_inactive_user, 'agent');

  INSERT INTO public.queues (id, name, color, is_active) VALUES
    (c_queue_a,      'Suporte',   '#111111', true),
    (c_queue_b,      'Comercial', '#222222', true),
    (c_queue_zombie, 'Zumbi',     '#333333', false);

  INSERT INTO public.sla_configurations (id, name, first_response_minutes, resolution_minutes, priority, is_default, is_active) VALUES
    (c_sla_cfg, 'Padrao do teste', 10, 120, 'medium', false, true);

  -- Volume: 1200 contatos aguardando numa fila so — prova que a agregacao nao herda o
  -- corte de 1000 linhas do PostgREST (o motivo do cartao).
  INSERT INTO public.contacts (id, name, phone, conversation_status, queue_id, assigned_to, is_lid_legacy)
  SELECT md5('warroom:grande:' || i)::uuid, 'Fila grande ' || i, '+5511900' || lpad(i::text, 6, '0'),
         'open', c_queue_a, NULL, false
  FROM generate_series(1, 1200) AS i;

  INSERT INTO public.contacts (id, name, phone, conversation_status, queue_id, assigned_to, deleted_at, is_lid_legacy) VALUES
    (c_b_wait,     'Espera',    '+5511900001', 'open',     c_queue_b, NULL,          NULL,                  false),
    (c_b_breach,   'Estourou',  '+5511900002', 'open',     c_queue_b, v_agent_prof,  NULL,                  false),
    (c_b_ok,       'Ok',        '+5511900003', 'open',     c_queue_b, v_agent_prof,  NULL,                  false),
    (c_b_resolved, 'Fechado',   '+5511900004', 'resolved', c_queue_b, v_agent_prof,  NULL,                  false),
    (c_b_deleted,  'Excluido',  '+5511900005', 'open',     c_queue_b, NULL,          now() - interval '1 minute', false),
    (c_b_zombie,   'Zumbi',     '+5511900006', 'open',     c_queue_zombie, NULL,      NULL,                  false);

  -- SLA (mediana de 1a resposta do dia: {1680s, 120s, 120s} → mediana 120, media 640)
  INSERT INTO public.conversation_sla (id, contact_id, sla_configuration_id, first_message_at, first_response_at, first_response_breached, created_at, updated_at) VALUES
    (md5('ws1')::uuid, c_b_wait,     c_sla_cfg, now() - interval '9 minutes',  NULL,                      false, now(), now()),
    (md5('ws2')::uuid, c_b_breach,   c_sla_cfg, now() - interval '30 minutes', now() - interval '2 minutes', true,  now(), now()),
    (md5('ws3')::uuid, c_b_ok,       c_sla_cfg, now() - interval '3 minutes',  now() - interval '1 minute',  false, now(), now()),
    (md5('ws4')::uuid, c_b_resolved, c_sla_cfg, now() - interval '40 minutes', now() - interval '38 minutes', false, now(), now());

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_t0    := v_today::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- Fechamentos: 2 do MESMO contato hoje (conta 1, nao 2) + 1 na vespera (nao conta hoje)
  INSERT INTO public.conversation_closures (id, contact_id, closed_by, close_reason, created_at) VALUES
    (md5('wcl1')::uuid, c_b_resolved, v_agent_prof, 'teste', v_t0 + interval '1 hour'),
    (md5('wcl2')::uuid, c_b_resolved, v_agent_prof, 'teste', v_t0 + interval '2 hours'),
    (md5('wcl3')::uuid, c_b_breach,   v_agent_prof, 'teste', v_t0 - interval '30 seconds');

  -- CSAT do dia: 5, 4, 2 → 2 de 3 com nota >= 4 → 67%
  INSERT INTO public.csat_surveys (id, contact_id, agent_id, rating, created_at) VALUES
    (md5('wcs1')::uuid, c_b_ok,       v_agent_prof, 5, v_t0 + interval '3 hours'),
    (md5('wcs2')::uuid, c_b_breach,   v_agent_prof, 4, v_t0 + interval '4 hours'),
    (md5('wcs3')::uuid, c_b_resolved, v_agent_prof, 2, v_t0 + interval '5 hours');

  -- ---------------------------------------------------- T1/T2: anon e negado (42501)
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.warroom_agent_today(NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := v_denied + 1;
  END;
  BEGIN
    PERFORM public.warroom_queue_stats();
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := v_denied + 1;
  END;
  EXECUTE 'RESET ROLE';
  IF v_denied <> 2 THEN
    RAISE EXCEPTION 'T1/T2 FALHOU: anon executou % de 2 RPCs (esperado 0)', 2 - v_denied;
  END IF;

  -- ------------------------------------------------- T3: authenticated nao-staff
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_agent_user)::text, true);
  v_arr := public.warroom_agent_today(NULL);
  IF v_arr IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'T3 FALHOU: nao-staff recebeu agentes: %', v_arr;
  END IF;
  v_arr := public.warroom_queue_stats();
  IF v_arr IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'T3 FALHOU: nao-staff recebeu filas: %', v_arr;
  END IF;

  -- ------------------------------------- T4..T9: staff (admin) ve o dia inteiro
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin_user)::text, true);
  v_agents := public.warroom_agent_today(NULL);
  v_queues := public.warroom_queue_stats();
  EXECUTE 'RESET ROLE';

  IF jsonb_typeof(v_agents) <> 'array' OR jsonb_typeof(v_queues) <> 'array' THEN
    RAISE EXCEPTION 'T4 FALHOU: retorno nao e array jsonb (%, %)', jsonb_typeof(v_agents), jsonb_typeof(v_queues);
  END IF;

  -- agente com amostra
  SELECT value INTO v_row FROM jsonb_array_elements(v_agents) WHERE value->>'id' = v_agent_prof::text;
  IF v_row IS NULL THEN RAISE EXCEPTION 'T5 FALHOU: agente ativo ausente do retorno'; END IF;
  IF v_row->>'activeChats'    IS DISTINCT FROM '2'   THEN RAISE EXCEPTION 'T5 activeChats=% (esperado 2: 2 episodios abertos da Ana; fechado e excluido fora)', v_row->>'activeChats'; END IF;
  IF v_row->>'maxChats'       IS DISTINCT FROM '7'   THEN RAISE EXCEPTION 'T5 maxChats=% (esperado 7)', v_row->>'maxChats'; END IF;
  IF v_row->>'resolvedToday'  IS DISTINCT FROM '1'   THEN RAISE EXCEPTION 'T5 resolvedToday=% (esperado 1: 2 fechamentos do MESMO contato hoje + 1 da vespera)', v_row->>'resolvedToday'; END IF;
  IF v_row->>'avgResponseTime' IS DISTINCT FROM '120' THEN RAISE EXCEPTION 'T5 avgResponseTime=% (esperado 120 = MEDIANA de {1680,120,120}; media seria 640)', v_row->>'avgResponseTime'; END IF;
  IF v_row->>'satisfaction'   IS DISTINCT FROM '67'  THEN RAISE EXCEPTION 'T5 satisfaction=% (esperado 67 = 2 de 3 notas >= 4)', v_row->>'satisfaction'; END IF;
  IF v_row->>'name' IS DISTINCT FROM 'Ana Agente'    THEN RAISE EXCEPTION 'T5 name=% (esperado Ana Agente)', v_row->>'name'; END IF;

  -- agente sem amostra: null, nunca 0
  SELECT value INTO v_row FROM jsonb_array_elements(v_agents) WHERE value->>'id' = v_admin_prof::text;
  IF v_row IS NULL THEN RAISE EXCEPTION 'T6 FALHOU: segundo agente ativo ausente'; END IF;
  IF v_row->>'activeChats'   IS DISTINCT FROM '0'    THEN RAISE EXCEPTION 'T6 activeChats=% (esperado 0)', v_row->>'activeChats'; END IF;
  IF v_row->>'resolvedToday' IS DISTINCT FROM '0'    THEN RAISE EXCEPTION 'T6 resolvedToday=% (esperado 0)', v_row->>'resolvedToday'; END IF;
  IF v_row->>'avgResponseTime' IS NOT NULL            THEN RAISE EXCEPTION 'T6 avgResponseTime=% (esperado null: sem SLA)', v_row->>'avgResponseTime'; END IF;
  IF v_row->>'satisfaction'  IS NOT NULL              THEN RAISE EXCEPTION 'T6 satisfaction=% (esperado null: sem CSAT)', v_row->>'satisfaction'; END IF;

  -- agente inativo nao entra
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_agents) WHERE value->>'id' = v_inactive_prof::text) THEN
    RAISE EXCEPTION 'T7 FALHOU: agente inativo (is_active=false) apareceu';
  END IF;

  -- p_date = vespera: janela do dia recorta SLA e fechamentos
  v_prev := public.warroom_agent_today(v_today - 1);
  SELECT value INTO v_row FROM jsonb_array_elements(v_prev) WHERE value->>'id' = v_agent_prof::text;
  IF v_row->>'resolvedToday' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'T8 resolvedToday(vespera)=% (esperado 1)', v_row->>'resolvedToday'; END IF;
  IF v_row->>'avgResponseTime' IS NOT NULL THEN RAISE EXCEPTION 'T8 avgResponseTime(vespera)=% (esperado null: SLA so tem amostra de hoje)', v_row->>'avgResponseTime'; END IF;

  -- fila de volume: sem corte de 1000
  SELECT value INTO v_row FROM jsonb_array_elements(v_queues) WHERE value->>'id' = c_queue_a::text;
  IF v_row IS NULL THEN RAISE EXCEPTION 'T9 FALHOU: fila Suporte ausente'; END IF;
  IF v_row->>'waiting' IS DISTINCT FROM '1200' THEN RAISE EXCEPTION 'T9 waiting=% (esperado 1200: sem corte de 1000)', v_row->>'waiting'; END IF;
  IF v_row->>'inProgress' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'T9 inProgress=% (esperado 0)', v_row->>'inProgress'; END IF;
  IF v_row->>'slaBreaches' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'T9 slaBreaches=% (esperado 0)', v_row->>'slaBreaches'; END IF;
  IF v_row->>'slaWarnings' IS NOT NULL THEN RAISE EXCEPTION 'T9 slaWarnings=% (esperado null: nenhum contato mensuravel)', v_row->>'slaWarnings'; END IF;
  IF v_row->>'avgWaitTime' IS NOT NULL THEN RAISE EXCEPTION 'T9 avgWaitTime=% (esperado null: sem base de espera)', v_row->>'avgWaitTime'; END IF;

  -- fila com SLA: espera, atendimento, estouro e risco
  SELECT value INTO v_row FROM jsonb_array_elements(v_queues) WHERE value->>'id' = c_queue_b::text;
  IF v_row IS NULL THEN RAISE EXCEPTION 'T10 FALHOU: fila Comercial ausente'; END IF;
  IF v_row->>'waiting'     IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'T10 waiting=% (esperado 1: excluido por deleted_at sai)', v_row->>'waiting'; END IF;
  IF v_row->>'inProgress'  IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'T10 inProgress=% (esperado 2: so conversation_status=open com dono)', v_row->>'inProgress'; END IF;
  IF v_row->>'slaBreaches' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'T10 slaBreaches=% (esperado 1)', v_row->>'slaBreaches'; END IF;
  IF v_row->>'slaWarnings' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'T10 slaWarnings=% (esperado 1: sem resposta ha 9min e o prazo e 10min)', v_row->>'slaWarnings'; END IF;
  IF v_row->>'avgWaitTime' IS DISTINCT FROM '9' THEN RAISE EXCEPTION 'T10 avgWaitTime=% (esperado 9 min de espera)', v_row->>'avgWaitTime'; END IF;

  -- fila inativa nao entra
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_queues) WHERE value->>'id' = c_queue_zombie::text) THEN
    RAISE EXCEPTION 'T11 FALHOU: fila inativa apareceu';
  END IF;

  -- ------------------------------------------- T12: postura das funcoes (ACL/secdef)
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.warroom_agent_today(date)'::regprocedure) THEN
    RAISE EXCEPTION 'T12 FALHOU: warroom_agent_today nao e SECURITY DEFINER';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.warroom_queue_stats()'::regprocedure) THEN
    RAISE EXCEPTION 'T12 FALHOU: warroom_queue_stats nao e SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.warroom_agent_today(date)'::regprocedure AND proconfig::text LIKE '%search_path=public%') THEN
    RAISE EXCEPTION 'T12 FALHOU: warroom_agent_today sem SET search_path';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.warroom_queue_stats()'::regprocedure AND proconfig::text LIKE '%search_path=public%') THEN
    RAISE EXCEPTION 'T12 FALHOU: warroom_queue_stats sem SET search_path';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('public.warroom_agent_today(date)'::regprocedure, 'public.warroom_queue_stats()'::regprocedure)
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T12 FALHOU: PUBLIC ainda tem EXECUTE nas RPCs do War Room';
  END IF;
  IF has_function_privilege('anon', 'public.warroom_agent_today(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12 FALHOU: anon tem EXECUTE em warroom_agent_today';
  END IF;
  IF has_function_privilege('anon', 'public.warroom_queue_stats()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12 FALHOU: anon tem EXECUTE em warroom_queue_stats';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.warroom_agent_today(date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.warroom_queue_stats()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12 FALHOU: authenticated sem EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.warroom_agent_today(date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.warroom_queue_stats()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12 FALHOU: service_role sem EXECUTE';
  END IF;

  RAISE NOTICE 'warroom_rpcs: T1..T12 OK (anon 42501, nao-staff [], staff com dados, 1200 sem corte)';
END $$;

ROLLBACK;
