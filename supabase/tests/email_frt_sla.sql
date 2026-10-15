-- email_frt_sla — T1–T10 sobre o SLA de primeira resposta de e-mail (cartão t_f8f1c412,
-- migration 20261015190039_email_frt_sla.sql).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid()/auth.role(),
-- e as tabelas de e-mail/horário/SLA nas formas REAIS do repositório, com RLS
-- ligada e as policies de "conta própria"). O stub de papel imita a função real
-- public.is_admin_or_supervisor(uuid): o usuário A é staff, o B não é.
-- Papel de usuário sempre por SET LOCAL ROLE dentro de DO $$ ... $$,
-- nunca superusuário/dono:
--   T1 minutos úteis: só o horário comercial da conexão padrão conta
--      (17:00→10:00 do dia seguinte = 120; fim de semana fechado = 30);
--   T2 limite: vem de sla_configurations.first_response_minutes (120 na fixture)
--      e cai no padrão 480 quando não há configuração ativa;
--   T3 gatilho: INSERT de outbound por authenticated marca first_reply_at,
--      frt_minutes=60 e sla_status='ok' na thread da própria conta;
--   T4 violação: resposta tardia grava 'violado';
--   T5 idempotência: segundo envio não reescreve a primeira resposta;
--   T6 sem mensagem recebida: nada é marcado;
--   T7 permissão (3 casos): staff (A) chama o resumo e recebe a contagem;
--      authenticated sem papel (B) é negado com 42501; anon é negado com 42501.
--      As 3 funções auxiliares e a de gatilho são internas: nem staff as executa
--      diretamente (42501), porque não têm GRANT a nenhum papel;
--   T8 resumo de staff: visão global (todas as threads: total 4, risco 0,
--      violados 2) e authenticated sem papel é negado;
--   T9 efeito controlado: o UPDATE do gatilho toca só a thread respondida —
--      updated_at das demais intacto (nenhum backfill em massa).
--   T10 reaplicação e rollback: aplicar a migration uma segunda vez não quebra e o
--      rollback do cabeçalho devolve o estado anterior (nada fica).
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-emailfrt-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-emailfrt-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=supabase/migrations/20261015190039_email_frt_sla.sql < supabase/tests/email_frt_sla.sql
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 falha já em T1.

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261015190039_email_frt_sla.sql'
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

-- Imita a public.is_admin_or_supervisor(uuid) real: só o usuário A é staff.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS
  $$ SELECT _user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid $$;

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
-- T1 — minutos úteis só no horário comercial (chamada direta como dono;
--      em produção a função é interna, sem GRANT — o teste T7 prova a negação)
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
-- T2 — limite vem da config de SLA do V2, com fallback (idem T1: via dono)
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
-- T7 — permissão em 3 casos: staff (A) recebe a contagem; authenticated sem
--      papel (B) é negado; anon é negado. As auxiliares e a função de gatilho
--      são internas: 42501 até para staff (sem GRANT a nenhum papel).
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_s record;
BEGIN
  -- caso 1: staff chama o resumo e recebe a contagem (TA ok, TB violado,
  -- TC ok sem âncora, TD violado em aberto → total 4, risco 0, violados 2)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_s FROM public.email_sla_summary();
  IF v_s.total_threads <> 4 OR v_s.em_risco <> 0 OR v_s.violados <> 2 THEN
    RAISE EXCEPTION 'T7 FALHOU: resumo staff = (%, %, %), esperado (4, 0, 2)',
      v_s.total_threads, v_s.em_risco, v_s.violados;
  END IF;
  RESET ROLE;

  -- caso 2: authenticated sem papel é negado no resumo (falha fechada 42501)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bbbbbbbb-0000-0000-0000-00000000000b','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.email_sla_summary();
    RAISE EXCEPTION 'T7 FALHOU: authenticated sem papel executou email_sla_summary';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;                               -- esperado: 42501 do gate de staff
  END;
  RESET ROLE;

  -- caso 3: anon é negado em tudo (sem GRANT: 42501 já na chamada)
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM * FROM public.email_sla_summary();
    RAISE EXCEPTION 'T7 FALHOU: anon executou email_sla_summary';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.email_business_minutes(now(), now() + interval '1 hour');
    RAISE EXCEPTION 'T7 FALHOU: anon executou email_business_minutes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.email_sla_threshold_minutes();
    RAISE EXCEPTION 'T7 FALHOU: anon executou email_sla_threshold_minutes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  -- internas: authenticated (mesmo staff) não executa auxiliar nem gatilho direto
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.email_business_minutes(now(), now() + interval '1 hour');
    RAISE EXCEPTION 'T7 FALHOU: authenticated executou email_business_minutes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.email_sla_threshold_minutes();
    RAISE EXCEPTION 'T7 FALHOU: authenticated executou email_sla_threshold_minutes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.register_email_first_reply_internal(
      '11110000-0000-0000-0000-000000000001', now());
    RAISE EXCEPTION 'T7 FALHOU: authenticated executou a função interna';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'T7 OK: staff recebe o resumo; sem papel e anon negados (42501); auxiliares internas';
END $$;

-- ---------------------------------------------------------------------------
-- T8 — resumo de staff tem visão global; sem papel continua negado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_a record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_a FROM public.email_sla_summary();
  RESET ROLE;

  -- global: TA ok + TB violado + TC ok + TD violado (thread de B inclusa: é staff)
  IF v_a.total_threads <> 4 OR v_a.violados <> 2 OR v_a.em_risco <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: resumo staff = (%, %, %), esperado (4, 0, 2)',
      v_a.total_threads, v_a.em_risco, v_a.violados;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bbbbbbbb-0000-0000-0000-00000000000b','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.email_sla_summary();
    RAISE EXCEPTION 'T8 FALHOU: authenticated sem papel executou email_sla_summary';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'T8 OK: resumo global de staff (4/0/2) e negação sem papel';
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

-- ---------------------------------------------------------------------------
-- T10 — reaplicacao e rollback de verdade: aplicar o MESMO arquivo da migration
--      uma segunda vez nao quebra (a constraint e guardada por pg_constraint) e o
--      SQL de rollback do cabecalho devolve o estado anterior (nada fica para tras).
--      O bloco de rollback abaixo espelha, na mesma ordem, as linhas de rollback
--      do cabecalho da migration.
-- ---------------------------------------------------------------------------
\i :mig

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint WHERE conname = 'email_threads_sla_status_check';
  IF n <> 1 THEN RAISE EXCEPTION 'T10 FALHOU: % constraint(s) com o nome esperado (1)', n; END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'email_messages_register_first_reply';
  IF n <> 1 THEN RAISE EXCEPTION 'T10 FALHOU: % gatilho(s) com o nome esperado (1)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('email_sla_threshold_minutes','email_business_minutes',
                       'register_email_first_reply_internal','trg_email_thread_first_reply',
                       'email_sla_summary');
  IF n <> 5 THEN RAISE EXCEPTION 'T10 FALHOU: % funcoes apos reaplicar (5)', n; END IF;
  RAISE NOTICE 'T10 OK (1/2): segunda aplicacao da migration nao quebra';
END $$;

-- Rollback executavel (espelha o cabecalho da migration, na mesma ordem):
drop trigger if exists email_messages_register_first_reply on public.email_messages;
drop function if exists public.trg_email_thread_first_reply();
drop function if exists public.register_email_first_reply_internal(uuid, timestamptz);
drop function if exists public.email_sla_summary();
drop function if exists public.email_business_minutes(timestamptz, timestamptz);
drop function if exists public.email_sla_threshold_minutes();
alter table public.email_threads drop constraint if exists email_threads_sla_status_check;
alter table public.email_threads drop column if exists first_reply_at, drop column if exists frt_minutes, drop column if exists sla_status;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'email_messages_register_first_reply';
  IF n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: o gatilho sobreviveu ao rollback'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('email_sla_threshold_minutes','email_business_minutes',
                       'register_email_first_reply_internal','trg_email_thread_first_reply',
                       'email_sla_summary');
  IF n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: % funcao(oes) sobreviveu ao rollback', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conname = 'email_threads_sla_status_check';
  IF n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: a constraint sobreviveu ao rollback'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'email_threads'
     AND column_name IN ('first_reply_at','frt_minutes','sla_status');
  IF n <> 0 THEN RAISE EXCEPTION 'T10 FALHOU: % coluna(s) sobreviveu ao rollback', n; END IF;
  RAISE NOTICE 'T10 OK (2/2): o rollback do cabecalho remove gatilho, 5 funcoes, constraint e as 3 colunas';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'email_frt_sla: TODAS as asserções passaram (T1-T10)';
END $$;

ROLLBACK;
