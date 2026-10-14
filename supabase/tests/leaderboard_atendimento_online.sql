-- Teste da RPC do ranking (public.dashboard_leaderboard) — módulo admin.
-- Cobre a migration 20261014133239_leaderboard_resolved_online.sql:
--   * conversations_resolved = conversas ATENDIDAS no período (1ª resposta registrada em
--     conversation_sla, atribuídas ao agente por contacts.assigned_to);
--   * avg_response_time = tempo médio de 1ª resposta em segundos;
--   * is_online = presença fresca em agent_presence (heartbeat <= 90 s e status <> 'offline'),
--     não mais profiles.is_active;
--   * guard: quem não é admin/supervisor recebe '[]'::jsonb; anon não tem EXECUTE (ACL).
--
-- Como rodar (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <nome-do-conjunto> -v ON_ERROR_STOP=1 \
--       < supabase/tests/leaderboard_atendimento_online.sql
--   (ON_ERROR_STOP=1 é obrigatório: sem ele o psql continua após um RAISE EXCEPTION e o
--    exit code mente.)
--
-- Fixture sintética (usuários/contatos fictícios) montada dentro de uma transação com
-- ROLLBACK no fim — nenhum dado do banco é afetado. As asserções executam sob os papéis
-- REAIS (SET LOCAL ROLE authenticated/anon, sem BYPASSRLS), como no PostgREST.
-- Sem EXCEPTION = verde.

BEGIN;

-- Fixture: desliga gatilhos/FK só ao montar (postgres superusuário); não vale para o teste.
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
VALUES
  ('a0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lb-admin@example.test', now(), now()),
  ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lb-agent-a@example.test', now(), now()),
  ('a0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lb-agent-b@example.test', now(), now()),
  ('a0000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lb-agent-c@example.test', now(), now());

INSERT INTO public.profiles (id, user_id, name, is_active, can_download)
VALUES
  ('b0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'LB Admin',  true, true),
  ('b0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a2', 'LB Agente A', true, true),
  ('b0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a3', 'LB Agente B', true, true),
  ('b0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-0000000000a4', 'LB Agente C', true, true);

INSERT INTO public.user_roles (user_id, role)
VALUES ('a0000000-0000-0000-0000-0000000000a1', 'admin');

-- Todos os 3 agentes têm agent_stats (a RPC só enumera agentes com linha em agent_stats).
INSERT INTO public.agent_stats
  (id, profile_id, xp, level, achievements_count, messages_sent, messages_received,
   conversations_resolved, current_streak, best_streak)
VALUES
  (gen_random_uuid(), 'b0000000-0000-0000-0000-0000000000a2', 0, 1, 0, 0, 0, 0, 0, 0),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-0000000000a3', 0, 1, 0, 0, 0, 0, 0, 0),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-0000000000a4', 0, 1, 0, 0, 0, 0, 0, 0);

-- Presença: A fresca/online; B 'online' mas heartbeat velho (aba fechada há 5 min);
-- C fresca mas 'offline' (ocultou o status de propósito).
INSERT INTO public.agent_presence (user_id, status, updated_at) VALUES
  ('a0000000-0000-0000-0000-0000000000a2', 'online',  now() - interval '5 seconds'),
  ('a0000000-0000-0000-0000-0000000000a3', 'online',  now() - interval '5 minutes'),
  ('a0000000-0000-0000-0000-0000000000a4', 'offline', now());

-- Contatos sintéticos: C1..C3 de A; C4 de B (distrator de atribuição).
INSERT INTO public.contacts (id, name, phone, assigned_to, conversation_status) VALUES
  ('d0000000-0000-0000-0000-0000000000c1', 'LB C1', '5511900000c1', 'b0000000-0000-0000-0000-0000000000a2', 'open'),
  ('d0000000-0000-0000-0000-0000000000c2', 'LB C2', '5511900000c2', 'b0000000-0000-0000-0000-0000000000a2', 'open'),
  ('d0000000-0000-0000-0000-0000000000c3', 'LB C3', '5511900000c3', 'b0000000-0000-0000-0000-0000000000a2', 'open'),
  ('d0000000-0000-0000-0000-0000000000c4', 'LB C4', '5511900000c4', 'b0000000-0000-0000-0000-0000000000a3', 'open');

-- Atendimentos de A hoje (SP): 1ª resposta em 60s, 90s e 120s -> 3 atendidas, média 90s.
-- Distrator de B: 1 atendida em 30s.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
SELECT c.id,
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '8 hours' + (v.s || ' seconds')::interval,
       false
FROM (VALUES ('d0000000-0000-0000-0000-0000000000c1'::uuid, 60),
             ('d0000000-0000-0000-0000-0000000000c2'::uuid, 90),
             ('d0000000-0000-0000-0000-0000000000c3'::uuid, 120),
             ('d0000000-0000-0000-0000-0000000000c4'::uuid, 30)) AS v(cid, s)
JOIN public.contacts c ON c.id = v.cid;

-- Um atendimento de A FORA do período 'today' (ontem-SP): não pode entrar na contagem de hoje.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
SELECT c.id,
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') - interval '1 day' + interval '8 hours',
       (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') - interval '1 day' + interval '8 hours' + interval '600 seconds',
       false
FROM public.contacts c WHERE c.id = 'd0000000-0000-0000-0000-0000000000c1';

SET LOCAL session_replication_role = origin;

DO $test$
DECLARE
  v_agent  text := json_build_object('sub', 'a0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated')::text;
  v_admin  text := json_build_object('sub', 'a0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text;
  v_res    jsonb;
  v_row    jsonb;
  v_ord_a  int;
  v_ord_b  int;
BEGIN
  -- ── BLOCO A: guard e ACL (papéis reais) ────────────────────────────────────
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', v_agent, true);
  BEGIN
    PERFORM public.dashboard_leaderboard('today', 10);
    RAISE EXCEPTION 'A1 FALHOU: anon executou dashboard_leaderboard (ACL quebrada)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'A1 OK: anon recebe permission denied';
  END;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', v_agent, true);
  v_res := public.dashboard_leaderboard('today', 10);
  IF v_res IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'A2 FALHOU: agente comum deveria receber []::jsonb, veio %', v_res;
  END IF;
  RAISE NOTICE 'A2 OK: agente comum recebe []';

  -- ── BLOCO B: admin vê o ranking real do período 'today' ────────────────────
  PERFORM set_config('request.jwt.claims', v_admin, true);
  v_res := public.dashboard_leaderboard('today', 50);

  SELECT elem INTO v_row FROM jsonb_array_elements(v_res) elem
   WHERE elem->>'profile_id' = 'b0000000-0000-0000-0000-0000000000a2';
  IF v_row IS NULL THEN RAISE EXCEPTION 'B0 FALHOU: agente A ausente do ranking'; END IF;

  IF (v_row->>'conversations_resolved')::int <> 3 THEN
    RAISE EXCEPTION 'B1 FALHOU: 3 conversas respondidas hoje deveriam dar conversations_resolved=3, veio %',
      v_row->>'conversations_resolved';
  END IF;
  RAISE NOTICE 'B1 OK: conversations_resolved=3 (3 atendidas hoje, ontem não conta)';

  IF (v_row->>'avg_response_time')::int <> 90 THEN
    RAISE EXCEPTION 'B2 FALHOU: média de 1ª resposta deveria ser 90s, veio %', v_row->>'avg_response_time';
  END IF;
  RAISE NOTICE 'B2 OK: avg_response_time=90 (média de 60/90/120)';

  IF (v_row->>'is_online')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'B3 FALHOU: agente com heartbeat fresco deveria estar online, veio %', v_row->>'is_online';
  END IF;
  RAISE NOTICE 'B3 OK: heartbeat fresco (5s) => is_online=true';

  SELECT elem INTO v_row FROM jsonb_array_elements(v_res) elem
   WHERE elem->>'profile_id' = 'b0000000-0000-0000-0000-0000000000a3';
  IF v_row IS NULL THEN RAISE EXCEPTION 'B4 FALHOU: agente B ausente do ranking'; END IF;
  IF (v_row->>'is_online')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'B4 FALHOU: heartbeat velho (5 min) deveria dar is_online=false, veio %', v_row->>'is_online';
  END IF;
  IF (v_row->>'conversations_resolved')::int <> 1 THEN
    RAISE EXCEPTION 'B4b FALHOU: distrator de B deveria dar 1 atendida, veio %', v_row->>'conversations_resolved';
  END IF;
  RAISE NOTICE 'B4 OK: presença velha => is_online=false; distrator de B=1';

  SELECT elem INTO v_row FROM jsonb_array_elements(v_res) elem
   WHERE elem->>'profile_id' = 'b0000000-0000-0000-0000-0000000000a4';
  IF v_row IS NULL THEN RAISE EXCEPTION 'B5 FALHOU: agente C ausente do ranking'; END IF;
  IF (v_row->>'is_online')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'B5 FALHOU: status offline explícito deveria dar is_online=false, veio %', v_row->>'is_online';
  END IF;
  RAISE NOTICE 'B5 OK: status offline (mesmo fresco) => is_online=false';

  -- B6: A vem antes de B na lista (ordenou por atendidas). Compara a POSIÇÃO de cada um,
  -- não a 1ª posição global: o banco local tem seed com outros agentes reais.
  SELECT min(ord) FILTER (WHERE t.elem->>'profile_id' = 'b0000000-0000-0000-0000-0000000000a2'),
         min(ord) FILTER (WHERE t.elem->>'profile_id' = 'b0000000-0000-0000-0000-0000000000a3')
    INTO v_ord_a, v_ord_b
  FROM jsonb_array_elements(v_res) WITH ORDINALITY AS t(elem, ord);
  IF v_ord_a IS NULL OR v_ord_b IS NULL OR v_ord_a > v_ord_b THEN
    RAISE EXCEPTION 'B6 FALHOU: A (3 atendidas) deveria vir antes de B (1); posições A=% B=%', v_ord_a, v_ord_b;
  END IF;
  RAISE NOTICE 'B6 OK: ranking ordena por atendidas (A antes de B)';

  RESET ROLE;
  RAISE NOTICE 'leaderboard_atendimento_online: SUITE OK (A1-A2, B0-B6)';
END $test$;

ROLLBACK;
