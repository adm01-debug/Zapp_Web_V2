-- Suite da RPC public.rpc_queue_goal_metrics() (cartao PM-02, paridade V3 dos limites de fila).
--
-- COMO RODAR (banco LOCAL do cartao, nunca producao):
--   hermes-db-migrar supabase/migrations/20261015232316_rpc_queue_goal_metrics.sql
--   zapp-db-local psql . v2-2610152019c517 < supabase/tests/rpc_queue_goal_metrics.sql
--
-- O QUE PROVA (cada bloco por PAPEL REAL, com SET LOCAL ROLE + request.jwt.claims):
--   P1  admin (staff) ve as 4 filas ativas e as metricas REAIS batem fila a fila
--       (conversas abertas, aguardando, espera media medida, taxa de atribuicao, pendentes);
--   P2  supervisor (staff) ve o mesmo conjunto do admin;
--   P3  agente MEMBRO ativo de UMA fila ve SO essa fila (fila alheia nao vaza);
--   P4  agente que e membro INATIVO (is_active = false) nao ve a fila;
--   P5  authenticated sem papel e sem vinculo recebe ZERO linhas (sem oraculo de fila alheia);
--   P6  anon e NEGADO por ACL (42501) - nem entra no corpo da funcao;
--   P7  fila SEM nenhum contato: metricas NULL e coverage = 'sem_base' (nunca 0 inventado);
--   P8  fila com contato ja resolvido: aguardando = 0 (0 e DADO) e taxa = NULL (sem recebido);
--   P9  fila INATIVA nao aparece nem para staff;
--   P10 taxa de atribuicao usa conversation_events: quem foi desatribuido por ultimo
--       ('unassign' mais recente que 'assign') NAO conta como atribuido;
--   P11 pendentes: so mensagem recebida (sender='contact'), nao lida e nao apagada de
--       conversa ABERTA da fila; conversa resolvida e mensagem lida/apagada nao contam;
--   P12 ACL exata: EXECUTE so para authenticated (nunca PUBLIC, anon ou service_role),
--       SECURITY DEFINER ligado e search_path fixo;
--   P13 a linha "-- Rollback (SQL executavel, na ordem)" roda no banco local (DROP) e o
--       ROLLBACK da transacao devolve a RPC - nada fica pela metade.
--
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final (nao sobra linha no banco).
-- Sem EXCEPTION = suite verde. ON_ERROR_STOP: o primeiro erro para a suite (saida != 0).
\set ON_ERROR_STOP on
BEGIN;

-- =====================================================================
-- Fixtures (como postgres, dentro da transacao)
-- =====================================================================
-- replica: o gatilho de auth.users nao deve barrar a fixture (o profile e criado logo abaixo).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-000000000001', 'authenticated', 'authenticated', 'adm.qgm@test.local',   '', now(), now(), now()),
  ('11111111-1111-4111-8111-000000000002', 'authenticated', 'authenticated', 'sup.qgm@test.local',   '', now(), now(), now()),
  ('11111111-1111-4111-8111-000000000003', 'authenticated', 'authenticated', 'agente.qgm@test.local','', now(), now(), now()),
  ('11111111-1111-4111-8111-000000000004', 'authenticated', 'authenticated', 'fora.qgm@test.local',  '', now(), now(), now());
SET LOCAL session_replication_role = DEFAULT;

-- handle_new_user cria o profile; o upsert cobre os dois mundos (gatilho presente ou nao).
INSERT INTO public.profiles (user_id, name) VALUES
  ('11111111-1111-4111-8111-000000000001', 'Admin QGM (sintetico)'),
  ('11111111-1111-4111-8111-000000000002', 'Super QGM (sintetico)'),
  ('11111111-1111-4111-8111-000000000003', 'Agente QGM (sintetico)'),
  ('11111111-1111-4111-8111-000000000004', 'Fora QGM (sintetico)')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

-- O papel efetivo para a RPC vem de user_roles (fonte do is_admin_or_supervisor);
-- profiles.role nao e tocado aqui (ha gatilho anti-escalonamento em profiles).


-- Staff = papel em user_roles (a fonte que is_admin_or_supervisor consulta).
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-4111-8111-000000000001', 'admin'),
  ('11111111-1111-4111-8111-000000000002', 'supervisor');

-- Filas: alfa (com metricas) / beta (do agente) / vazia / inativa / so-resolvidas.
INSERT INTO public.queues (id, name, color, is_active) VALUES
  ('33333333-3333-4333-8333-000000000001', 'Alfa QGM',     '#3B82F6', true),
  ('33333333-3333-4333-8333-000000000002', 'Beta QGM',     '#3B82F6', true),
  ('33333333-3333-4333-8333-000000000003', 'Vazia QGM',    '#3B82F6', true),
  ('33333333-3333-4333-8333-000000000004', 'Inativa QGM',  '#3B82F6', false),
  ('33333333-3333-4333-8333-000000000005', 'Resolvida QGM','#3B82F6', true);

-- Agente e membro ATIVO de Beta; e membro INATIVO de Alfa (P4).
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('33333333-3333-4333-8333-000000000002',
   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000003'), true),
  ('33333333-3333-4333-8333-000000000001',
   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000003'), false),
  ('33333333-3333-4333-8333-000000000001',
   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000004'), false);

-- Alfa: 5 contatos no total (4 abertos, sendo 2 aguardando), 4 recebidos na janela
-- (c1, c2, c3, c5) - c4 aguarda mas chegou ha 30 dias.
-- Beta: 1 contato aberto e aguardando, recebido na janela.
-- Resolvida: 1 contato recebido FORA da janela e ja resolvido.
-- Inativa: 1 contato aberto (nao pode aparecer por causa do is_active).
INSERT INTO public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, created_at) VALUES
  ('44444444-4444-4444-8444-000000000001', 'A1 aberto atribuido',   '+550000000001', 'open',     (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000001'), '33333333-3333-4333-8333-000000000001', now() - interval '2 hours'),
  ('44444444-4444-4444-8444-000000000002', 'A2 aberto atribuido',   '+550000000002', 'open',     (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000002'), '33333333-3333-4333-8333-000000000001', now() - interval '2 hours'),
  ('44444444-4444-4444-8444-000000000003', 'A3 aguardando',         '+550000000003', 'open',     NULL, '33333333-3333-4333-8333-000000000001', now() - interval '3 hours'),
  ('44444444-4444-4444-8444-000000000004', 'A4 aguardando antigo',  '+550000000004', 'waiting',  NULL, '33333333-3333-4333-8333-000000000001', now() - interval '30 days'),
  ('44444444-4444-4444-8444-000000000005', 'A5 resolvido',          '+550000000005', 'resolved', (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000001'), '33333333-3333-4333-8333-000000000001', now() - interval '2 hours'),
  ('44444444-4444-4444-8444-000000000008', 'B1 aguardando',         '+550000000008', 'open',     NULL, '33333333-3333-4333-8333-000000000002', now() - interval '1 hour'),
  ('44444444-4444-4444-8444-000000000009', 'E1 resolvido antigo',   '+550000000009', 'resolved', NULL, '33333333-3333-4333-8333-000000000005', now() - interval '30 days'),
  ('44444444-4444-4444-8444-000000000010', 'I1 aberto na inativa',  '+550000000010', 'open',     NULL, '33333333-3333-4333-8333-000000000004', now() - interval '1 hour');

-- Espera: A3 entrou ha 10 minutos (medida); A4 NAO tem posicao; B1 so tem a estimativa
-- da propria fila (entered_at NULL, estimated_wait_minutes 25).
INSERT INTO public.queue_positions (id, contact_id, queue_id, position, estimated_wait_minutes, entered_at) VALUES
  ('66666666-6666-4666-8666-000000000001', '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000001', 1, NULL, now() - interval '10 minutes'),
  ('66666666-6666-4666-8666-000000000002', '44444444-4444-4444-8444-000000000008', '33333333-3333-4333-8333-000000000002', 1, 25,   NULL);

-- Atribuicao na janela: A1 'assign' (conta); A2 'assign' e depois 'unassign' (NAO conta);
-- A3 e A5 sem evento. A4 so teve 'assign' fora da janela (nao conta).
INSERT INTO public.conversation_events (id, contact_id, event_type, to_agent_id, created_at) VALUES
  ('77777777-7777-4777-8777-000000000001', '44444444-4444-4444-8444-000000000001', 'assign',   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000001'), now() - interval '1 hour'),
  ('77777777-7777-4777-8777-000000000002', '44444444-4444-4444-8444-000000000002', 'assign',   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000002'), now() - interval '90 minutes'),
  ('77777777-7777-4777-8777-000000000003', '44444444-4444-4444-8444-000000000002', 'unassign', NULL, now() - interval '30 minutes'),
  ('77777777-7777-4777-8777-000000000004', '44444444-4444-4444-8444-000000000004', 'assign',   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000001'), now() - interval '30 days'),
  ('77777777-7777-4777-8777-000000000005', '44444444-4444-4444-8444-000000000008', 'assign',   (SELECT id FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-000000000003'), now() - interval '30 minutes');

-- Pendentes em Alfa = 2 (m1 do A1 e m3 do A3, ambos nao lidos e nao apagados).
-- m2 lida, m4 do agente, m5 apagada e m6 de conversa resolvida NAO contam.
INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, is_deleted) VALUES
  ('55555555-5555-4555-8555-000000000001', '44444444-4444-4444-8444-000000000001', 'contact', 'm1 pendente',        'text', false, false),
  ('55555555-5555-4555-8555-000000000002', '44444444-4444-4444-8444-000000000001', 'contact', 'm2 lida',            'text', true,  false),
  ('55555555-5555-4555-8555-000000000003', '44444444-4444-4444-8444-000000000003', 'contact', 'm3 pendente',        'text', false, false),
  ('55555555-5555-4555-8555-000000000004', '44444444-4444-4444-8444-000000000003', 'agent',   'm4 do agente',       'text', false, false),
  ('55555555-5555-4555-8555-000000000005', '44444444-4444-4444-8444-000000000001', 'contact', 'm5 apagada',         'text', false, true),
  ('55555555-5555-4555-8555-000000000006', '44444444-4444-4444-8444-000000000005', 'contact', 'm6 de resolvida',    'text', false, false),
  ('55555555-5555-4555-8555-000000000007', '44444444-4444-4444-8444-000000000009', 'contact', 'm7 de resolvida',    'text', false, false);

-- =====================================================================
-- P12 - contrato no catalogo (como postgres, antes de qualquer papel)
-- =====================================================================
DO $p12$
DECLARE
  v_def boolean;
  v_cfg text;
  v_public boolean;
BEGIN
  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_def, v_cfg
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_queue_goal_metrics'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'P12: public.rpc_queue_goal_metrics() nao foi criada';
  END IF;
  IF v_def IS NOT TRUE THEN
    RAISE EXCEPTION 'P12: a RPC nao e SECURITY DEFINER';
  END IF;
  IF v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'P12: search_path nao esta fixo em public, pg_temp (esta: %)', v_cfg;
  END IF;

  -- EXECUTE: so authenticated. PUBLIC NUNCA (senao todo papel herdado entra pelo default).
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_queue_goal_metrics'
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND a.grantee = 0
  ) INTO v_public;
  IF v_public THEN
    RAISE EXCEPTION 'P12: PUBLIC ficou com EXECUTE na RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_queue_goal_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P12: authenticated NAO pode executar a RPC';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_queue_goal_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P12: anon NAO devia poder executar a RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.rpc_queue_goal_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P12: service_role NAO devia poder executar a RPC (cartao: so authenticated)';
  END IF;
END;
$p12$;

-- =====================================================================
-- P1 - admin (staff) ve tudo e as metricas batem
-- =====================================================================
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-000000000001', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $p1$
DECLARE
  r record;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.rpc_queue_goal_metrics() WHERE queue_name LIKE '%QGM%';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'P1: admin devia ver 4 filas ativas, viu %', v_count;
  END IF;

  -- Alfa: abertos 4 (A1..A4), aguardando 2 (A3, A4), espera 10.0 (A3), recebidos 4,
  -- atribuidos 1 (so A1 - A2 terminou 'unassign'), taxa 25.0, pendentes 2.
  -- Comparacao com IS DISTINCT FROM: NULL nunca passa por engano (nem tapa buraco).
  SELECT * INTO r FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Alfa QGM';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P1: fila Alfa QGM nao apareceu para o admin';
  END IF;
  IF r.coverage IS DISTINCT FROM 'completa'
     OR r.contacts_open IS DISTINCT FROM 4::bigint
     OR r.waiting_contacts IS DISTINCT FROM 2::bigint
     OR r.avg_wait_minutes IS DISTINCT FROM 10.0::numeric
     OR r.received_contacts IS DISTINCT FROM 4::bigint
     OR r.assigned_contacts IS DISTINCT FROM 1::bigint
     OR r.assignment_rate IS DISTINCT FROM 25.0::numeric
     OR r.messages_pending IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'P1: Alfa fora do esperado -> coverage=% abertos=% aguardando=% espera=% recebidos=% atribuidos=% taxa=% pendentes=%',
      r.coverage, r.contacts_open, r.waiting_contacts, r.avg_wait_minutes,
      r.received_contacts, r.assigned_contacts, r.assignment_rate, r.messages_pending;
  END IF;

  -- Beta: sem posicao medida, cai na estimativa da propria fila (25) e taxa 100.0.
  SELECT * INTO r FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Beta QGM';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P1: fila Beta QGM nao apareceu para o admin';
  END IF;
  IF r.coverage IS DISTINCT FROM 'completa'
     OR r.contacts_open IS DISTINCT FROM 1::bigint
     OR r.waiting_contacts IS DISTINCT FROM 1::bigint
     OR r.avg_wait_minutes IS DISTINCT FROM 25.0::numeric
     OR r.received_contacts IS DISTINCT FROM 1::bigint
     OR r.assigned_contacts IS DISTINCT FROM 1::bigint
     OR r.assignment_rate IS DISTINCT FROM 100.0::numeric
     OR r.messages_pending IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'P1: Beta fora do esperado -> coverage=% abertos=% aguardando=% espera=% recebidos=% atribuidos=% taxa=% pendentes=%',
      r.coverage, r.contacts_open, r.waiting_contacts, r.avg_wait_minutes,
      r.received_contacts, r.assigned_contacts, r.assignment_rate, r.messages_pending;
  END IF;
END;
$p1$;

-- =====================================================================
-- P2 - supervisor (staff) ve o mesmo conjunto
-- =====================================================================
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-000000000002', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $p2$
DECLARE
  v_nomes text;
BEGIN
  SELECT string_agg(queue_name, ',' ORDER BY queue_name) INTO v_nomes
  FROM public.rpc_queue_goal_metrics() WHERE queue_name LIKE '%QGM%';

  IF v_nomes IS DISTINCT FROM 'Alfa QGM,Beta QGM,Resolvida QGM,Vazia QGM' THEN
    RAISE EXCEPTION 'P2: supervisor devia ver as 4 filas ativas, viu [%]', coalesce(v_nomes, 'vazio');
  END IF;
END;
$p2$;

-- =====================================================================
-- P3/P4 - agente membro ATIVO de Beta ve so Beta; membro inativo de Alfa nao ve Alfa
-- =====================================================================
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-000000000003', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $p3$
DECLARE
  v_nomes text;
  r record;
BEGIN
  SELECT string_agg(queue_name, ',' ORDER BY queue_name) INTO v_nomes
  FROM public.rpc_queue_goal_metrics() WHERE queue_name LIKE '%QGM%';

  IF v_nomes IS DISTINCT FROM 'Beta QGM' THEN
    RAISE EXCEPTION 'P3: agente membro de Beta devia ver so Beta, viu [%]', coalesce(v_nomes, 'vazio');
  END IF;

  SELECT * INTO r FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Beta QGM';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P3: agente membro nao viu a fila Beta QGM';
  END IF;
  IF r.queue_id IS DISTINCT FROM '33333333-3333-4333-8333-000000000002'::uuid THEN
    RAISE EXCEPTION 'P3: agente recebeu a fila errada (%)', r.queue_id;
  END IF;
END;
$p3$;

-- =====================================================================
-- P5 - authenticated sem papel e sem vinculo: zero linhas (nao erro, nao vaza fila alheia)
-- =====================================================================
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-000000000004', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $p5$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.rpc_queue_goal_metrics();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P5: perfil sem papel e sem vinculo devia receber 0 linhas, recebeu %', v_count;
  END IF;
END;
$p5$;

-- =====================================================================
-- P6 - anon NEGADO por ACL (42501), nem entra no corpo da funcao
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;

DO $p6$
DECLARE
  v_negado boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.rpc_queue_goal_metrics();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_negado := true;
  END;

  IF NOT v_negado THEN
    RAISE EXCEPTION 'P6: anon conseguiu executar a RPC (devia dar 42501)';
  END IF;
END;
$p6$;

-- =====================================================================
-- P7/P8/P9 - sem base (NULL), 0 como dado, fila inativa fora (volta ao staff)
-- =====================================================================
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-000000000001', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $p789$
DECLARE
  r record;
BEGIN
  -- P7: fila sem NENHUM contato -> nada de 0 inventado.
  SELECT * INTO r FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Vazia QGM';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P7: fila Vazia QGM nao apareceu para o admin';
  END IF;
  IF r.coverage IS DISTINCT FROM 'sem_base'
     OR r.contacts_open IS NOT NULL
     OR r.waiting_contacts IS NOT NULL
     OR r.avg_wait_minutes IS NOT NULL
     OR r.assignment_rate IS NOT NULL
     OR r.received_contacts IS NOT NULL
     OR r.assigned_contacts IS NOT NULL
     OR r.messages_pending IS NOT NULL THEN
    RAISE EXCEPTION 'P7: fila vazia devia ser sem_base com tudo NULL (coverage=%, abertos=%, aguardando=%, espera=%, taxa=%, pendentes=%)',
      r.coverage, r.contacts_open, r.waiting_contacts, r.avg_wait_minutes, r.assignment_rate, r.messages_pending;
  END IF;

  -- P8: contato resolvido -> aguardando 0 (dado), taxa NULL (nada recebido na janela),
  -- pendentes 0 (mensagem da conversa resolvida nao conta).
  SELECT * INTO r FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Resolvida QGM';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P8: fila Resolvida QGM nao apareceu para o admin';
  END IF;
  IF r.coverage IS DISTINCT FROM 'parcial'
     OR r.contacts_open IS DISTINCT FROM 0::bigint
     OR r.waiting_contacts IS DISTINCT FROM 0::bigint
     OR r.avg_wait_minutes IS NOT NULL
     OR r.received_contacts IS DISTINCT FROM 0::bigint
     OR r.assigned_contacts IS DISTINCT FROM 0::bigint
     OR r.assignment_rate IS NOT NULL
     OR r.messages_pending IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'P8: resolvida fora do esperado -> coverage=% abertos=% aguardando=% espera=% recebidos=% atribuidos=% taxa=% pendentes=%',
      r.coverage, r.contacts_open, r.waiting_contacts, r.avg_wait_minutes,
      r.received_contacts, r.assigned_contacts, r.assignment_rate, r.messages_pending;
  END IF;

  -- P9: fila inativa nao aparece nem para staff.
  IF EXISTS (SELECT 1 FROM public.rpc_queue_goal_metrics() WHERE queue_name = 'Inativa QGM') THEN
    RAISE EXCEPTION 'P9: fila inativa apareceu para o admin';
  END IF;
END;
$p789$;

RESET ROLE;

-- =====================================================================
-- P13 - a linha do Rollback roda de verdade, e o ROLLBACK devolve a RPC
-- =====================================================================
DO $p13$
BEGIN
  DROP FUNCTION IF EXISTS public.rpc_queue_goal_metrics();
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_queue_goal_metrics'
  ) THEN
    RAISE EXCEPTION 'P13: o DROP do Rollback nao removeu a RPC';
  END IF;
  RAISE NOTICE 'P13: linha do Rollback executada com sucesso (DROP FUNCTION)';
END;
$p13$;

ROLLBACK;

-- Confere que o ROLLBACK devolveu a suite ao estado pos-migration (a RPC continua la).
DO $fim$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_queue_goal_metrics'
  ) THEN
    RAISE EXCEPTION 'fim: a RPC sumiu depois do ROLLBACK';
  END IF;
  RAISE NOTICE 'rpc_queue_goal_metrics: suite VERDE (P1-P13)';
END;
$fim$;
