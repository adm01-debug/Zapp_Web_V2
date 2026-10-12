-- email_frt_sla — T1–T9 sobre o SLA de primeira resposta de e-mail (cartão t_f8f1c412,
-- migration 20261012122708_email_frt_sla.sql).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid()/auth.role(),
-- e as tabelas de e-mail/horário/SLA nas formas REAIS do repositório, com RLS
-- ligada e as policies de "conta própria"). Papel de usuário sempre por
-- SET LOCAL ROLE dentro de DO $$ ... $$, nunca superusuário/dono:
--   T1 minutos úteis: só o horário comercial da conexão padrão conta
--      (17:00→10:00 do dia seguinte = 120; fim de semana fechado = 30);
--   T2 limite: vem de sla_configurations.first_response_minutes (120 na fixture)
--      e cai no padrão 480 quando não há configuração ativa;
--   T3 gatilho: INSERT de outbound por authenticated marca first_reply_at,
--      frt_minutes=60 e sla_status='ok' na thread da própria conta;
--   T4 violação: resposta tardia grava 'violado';
--   T5 idempotência: segundo envio não reescreve a primeira resposta;
--   T6 sem mensagem recebida: nada é marcado;
--   T7 permissão: anon NÃO executa o resumo nem as funções internas;
--      authenticated executa SÓ o resumo (as internas ficam revogadas);
--   T8 escopo RLS: o resumo de cada usuário conta apenas as threads das
--      contas dele (A conta 3, violado 1; B conta 1, violado 1);
--   T9 efeito controlado: o UPDATE do gatilho toca só a thread respondida —
--      updated_at das demais intacto (nenhum backfill em massa).
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-emailfrt-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-emailfrt-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=supabase/migrations/20261012122708_email_frt_sla.sql < supabase/tests/email_frt_sla.sql
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 falha já em T3.

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261012122708_email_frt_sla.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR à migration: sem colunas/gatilho novos)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN new.updated_at := now(); RETURN new; END $$;

CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL
);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_email_threads_updated_at
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  gmail_account_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  internal_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  is_open boolean DEFAULT true,
  open_time time DEFAULT '09:00:00',
  close_time time DEFAULT '18:00:00',
  UNIQUE (whatsapp_connection_id, day_of_week)
);

CREATE TABLE public.sla_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  first_response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'medium',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Permissões de tabela como em produção (a decisão de linha fica na RLS).
GRANT SELECT, INSERT, UPDATE ON public.gmail_accounts, public.email_threads, public.email_messages TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- RLS ligada com as MESMAS policies de "conta própria" das tabelas reais.
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail accounts" ON public.gmail_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can view threads of own accounts" ON public.email_threads
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));

CREATE POLICY "Users can insert messages for own accounts" ON public.email_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid()));

CREATE POLICY "Users can view messages of own accounts" ON public.email_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));

-- ---------------------------------------------------------------------------
-- Fixtures (inseridos como postgres, ANTES da migration — o gatilho ainda não existe)
-- Oct 12/2026 é segunda; fuso do negócio America/Sao_Paulo (-03, sem DST).
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_connections (id, is_default) VALUES
  ('c0000000-0000-0000-0000-000000000001', true),
  ('c0000000-0000-0000-0000-000000000002', false);

-- Segunda a sexta, 09:00–18:00. Fim de semana fechado (linhas ausentes = aberto pelo
-- comportamento do V2, então gravamos explicitamente is_open=false em sáb/dom).
INSERT INTO public.business_hours (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
SELECT 'c0000000-0000-0000-0000-000000000001', d, (d between 1 and 5),
       CASE WHEN d between 1 and 5 THEN '09:00:00'::time ELSE NULL END,
       CASE WHEN d between 1 and 5 THEN '18:00:00'::time ELSE NULL END
  FROM generate_series(0, 6) AS d;

INSERT INTO public.sla_configurations (name, first_response_minutes, resolution_minutes, priority, is_default, is_active)
VALUES ('Padrão', 120, 2880, 'medium', true, true);

INSERT INTO public.gmail_accounts (id, user_id, email_address) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'conta-a@example.com'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'conta-b@example.com');

INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, updated_at) VALUES
  ('11110000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'ta', '2026-01-01 00:00:00-03'),
  ('11110000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'tb', '2026-01-01 00:00:00-03'),
  ('11110000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'tc', '2026-01-01 00:00:00-03'),
  ('11110000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'td', '2026-01-01 00:00:00-03');

-- TA: recebida na segunda antes da abertura (08:30) → âncora dentro do horário às 09:00.
-- TB: recebida segunda 09:00 (resposta tardia na quarta).
-- TD: recebida na quinta anterior (thread aberta há dias).
-- TC: nenhuma recebida.
INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date) VALUES
  ('11110000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'inbound', '2026-10-12 08:30:00-03'),
  ('11110000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'inbound', '2026-10-12 09:00:00-03'),
  ('11110000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'inbound', '2026-10-08 09:00:00-03');

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — minutos úteis só no horário comercial
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_cross integer; v_weekend integer;
BEGIN
  v_cross := public.email_business_minutes('2026-10-12 17:00:00-03'::timestamptz, '2026-10-13 10:00:00-03'::timestamptz);
  IF v_cross <> 120 THEN
    RAISE EXCEPTION 'T1 FALHOU: 17:00->10:00 do dia seguinte = % min, esperado 120', v_cross;
  END IF;

  v_weekend := public.email_business_minutes('2026-10-17 09:00:00-03'::timestamptz, '2026-10-19 09:30:00-03'::timestamptz);
  IF v_weekend <> 30 THEN
    RAISE EXCEPTION 'T1 FALHOU: fim de semana fechado = % min, esperado 30', v_weekend;
  END IF;

  RAISE NOTICE 'T1 OK: minutos úteis contam só o horário comercial (120 e 30)';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — limite vem da config de SLA do V2, com fallback
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_min integer;
BEGIN
  v_min := public.email_sla_threshold_minutes();
  IF v_min <> 120 THEN
    RAISE EXCEPTION 'T2 FALHOU: limite = % min, esperado 120 (sla_configurations)', v_min;
  END IF;

  UPDATE public.sla_configurations SET is_active = false;
  v_min := public.email_sla_threshold_minutes();
  IF v_min <> 480 THEN
    RAISE EXCEPTION 'T2 FALHOU: sem config ativa o limite deveria ser 480, veio %', v_min;
  END IF;
  UPDATE public.sla_configurations SET is_active = true;

  RAISE NOTICE 'T2 OK: limite 120 da config e fallback 480';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — RESTRICTED (authenticated) marca a primeira resposta dentro do prazo
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_row public.email_threads;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'outbound', '2026-10-12 10:00:00-03');
  RESET ROLE;

  SELECT * INTO v_row FROM public.email_threads WHERE id = '11110000-0000-0000-0000-000000000001';
  IF v_row.first_reply_at IS DISTINCT FROM '2026-10-12 10:00:00-03'::timestamptz THEN
    RAISE EXCEPTION 'T3 FALHOU: first_reply_at = %, esperado 2026-10-12 10:00-03', v_row.first_reply_at;
  END IF;
  IF v_row.frt_minutes <> 60 THEN
    RAISE EXCEPTION 'T3 FALHOU: frt_minutes = %, esperado 60', v_row.frt_minutes;
  END IF;
  IF v_row.sla_status <> 'ok' THEN
    RAISE EXCEPTION 'T3 FALHOU: sla_status = %, esperado ok', v_row.sla_status;
  END IF;

  RAISE NOTICE 'T3 OK: gatilho marcou a primeira resposta (60 min, ok)';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — resposta tardia grava 'violado'
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_row public.email_threads;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'outbound', '2026-10-14 10:00:00-03');
  RESET ROLE;

  SELECT * INTO v_row FROM public.email_threads WHERE id = '11110000-0000-0000-0000-000000000002';
  -- segunda 09-18 (540) + terça (540) + quarta 09-10 (60) = 1140 > 120
  IF v_row.frt_minutes <> 1140 THEN
    RAISE EXCEPTION 'T4 FALHOU: frt_minutes = %, esperado 1140', v_row.frt_minutes;
  END IF;
  IF v_row.sla_status <> 'violado' THEN
    RAISE EXCEPTION 'T4 FALHOU: sla_status = %, esperado violado', v_row.sla_status;
  END IF;

  RAISE NOTICE 'T4 OK: resposta tardia gravou violado (1140 min)';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — segundo envio NÃO reescreve a primeira resposta (idempotência)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_row public.email_threads;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'outbound', '2026-10-13 09:30:00-03');
  RESET ROLE;

  SELECT * INTO v_row FROM public.email_threads WHERE id = '11110000-0000-0000-0000-000000000001';
  IF v_row.first_reply_at IS DISTINCT FROM '2026-10-12 10:00:00-03'::timestamptz OR v_row.frt_minutes <> 60 THEN
    RAISE EXCEPTION 'T5 FALHOU: primeira resposta reescrita (% / %)',
      v_row.first_reply_at, v_row.frt_minutes;
  END IF;

  RAISE NOTICE 'T5 OK: segundo envio manteve a primeira resposta';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — envio sem mensagem recebida pendente não marca nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_row public.email_threads;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'outbound', '2026-10-13 10:00:00-03');
  RESET ROLE;

  SELECT * INTO v_row FROM public.email_threads WHERE id = '11110000-0000-0000-0000-000000000003';
  IF v_row.first_reply_at IS NOT NULL OR v_row.frt_minutes IS NOT NULL OR v_row.sla_status IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: thread sem recebida foi marcada (% / % / %)',
      v_row.first_reply_at, v_row.frt_minutes, v_row.sla_status;
  END IF;

  RAISE NOTICE 'T6 OK: envio sem recebida pendente não marca nada';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — permissão: anon fora de tudo; authenticated só no resumo
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM * FROM public.email_sla_summary();
    RAISE EXCEPTION 'T7 FALHOU: anon executou email_sla_summary';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;                               -- esperado: 42501
  END;

  BEGIN
    PERFORM public.email_business_minutes(now(), now() + interval '1 hour');
    RAISE EXCEPTION 'T7 FALHOU: anon executou email_business_minutes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.register_email_first_reply_internal(
      '11110000-0000-0000-0000-000000000001', now());
    RAISE EXCEPTION 'T7 FALHOU: authenticated executou a função interna';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'T7 OK: anon e authenticated não chamam o que é interno; resumo é liberado só a authenticated';
END $$;

-- ---------------------------------------------------------------------------
-- T8 — resumo respeita a RLS: cada usuário conta só as threads das contas dele
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_a record; v_b record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_a FROM public.email_sla_summary();
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bbbbbbbb-0000-0000-0000-00000000000b','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_b FROM public.email_sla_summary();
  RESET ROLE;

  IF v_a.total_threads <> 3 OR v_a.violados <> 1 OR v_a.em_risco <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: conta A = (%, %, %), esperado (3, 0, 1)',
      v_a.total_threads, v_a.em_risco, v_a.violados;
  END IF;
  IF v_b.total_threads <> 1 OR v_b.violados <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: conta B = (%, %, %), esperado (1, ?, 1)',
      v_b.total_threads, v_b.em_risco, v_b.violados;
  END IF;

  RAISE NOTICE 'T8 OK: resumo escopado pela RLS (A=3/0/1, B=1/?/1)';
END $$;

-- ---------------------------------------------------------------------------
-- T9 — o UPDATE do gatilho toca SÓ a thread respondida: nenhuma outra revisa
--      updated_at (a recusa real de 06/10 foi backfill reescrevendo datas em massa)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_antes jsonb; v_depois jsonb; v_te public.email_threads;
BEGIN
  -- thread nova, com recebida pendente, fora da contagem do T8
  INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, updated_at)
  VALUES ('11110000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'te', '2026-01-01 00:00:00-03');
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'inbound', '2026-10-12 09:30:00-03');

  SELECT jsonb_object_agg(id::text, to_jsonb(updated_at)) INTO v_antes FROM public.email_threads;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.email_messages (thread_id, gmail_account_id, direction, internal_date)
  VALUES ('11110000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'outbound', '2026-10-12 09:45:00-03');
  RESET ROLE;

  SELECT jsonb_object_agg(id::text, to_jsonb(updated_at)) INTO v_depois FROM public.email_threads;

  SELECT * INTO v_te FROM public.email_threads WHERE id = '11110000-0000-0000-0000-000000000005';
  IF v_te.first_reply_at IS NULL OR v_te.frt_minutes <> 15 THEN
    RAISE EXCEPTION 'T9 FALHOU: TE não foi marcada (%, %)', v_te.first_reply_at, v_te.frt_minutes;
  END IF;
  IF (v_depois ->> '11110000-0000-0000-0000-000000000005') = (v_antes ->> '11110000-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'T9 FALHOU: updated_at da thread respondida não avançou';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_antes) a
      JOIN jsonb_each_text(v_depois) d USING (key)
     WHERE a.key <> '11110000-0000-0000-0000-000000000005' AND a.value IS DISTINCT FROM d.value
  ) THEN
    RAISE EXCEPTION 'T9 FALHOU: updated_at de outra thread foi reescrito (efeito em massa)';
  END IF;

  RAISE NOTICE 'T9 OK: o UPDATE toca só a thread respondida; updated_at das demais intacto';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'email_frt_sla: TODAS as asserções passaram (T1-T9)';
END $$;

ROLLBACK;
