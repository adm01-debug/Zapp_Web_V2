-- monitoring_message_buckets — T1–T8 sobre a RPC REAL do item 374 (R2-INF-028)
-- (supabase/migrations/20261013230006_monitoring_message_buckets.sql, cartão t_cb75a447).
--
-- O QUE PROVA (critério do cartão):
--   T1 a agregação por balde conta cada direção no balde certo e respeita a borda
--      das horas (mensagem às 06:00:00 fica FORA da janela 00:00–06:00);
--   T2 período movimentado (1.200 mensagens) soma 1.200 — o cliente antigo cortava
--      em `limit 1000` e o total ficava menor que a realidade;
--   T3 o balde é ancorado no fuso America/Sao_Paulo: hora cheia local e dia civil
--      local, mesmo com p_from no meio da hora;
--   T4 anon é negado já no GRANT (42501);
--   T5 authenticated fora do staff é negado pelo guard interno (42501);
--   T6 entradas inválidas abortam com 22023 (bucket < 1 minuto, janela invertida,
--      janela larga demais, bucket nulo) sem devolver linha alguma;
--   T7 bordas half-open: >= p_from e < p_to — cada mensagem cai em UM balde;
--   T8 service_role também é negado (não há caminho de serviço para esta leitura).
--
-- Superfície mínima criada à mão (Postgres descartável): roles anon/authenticated/
-- service_role, schema auth com auth.uid()/auth.role(), a tabela public.messages
-- com o essencial (sender, created_at) e um public.is_admin_or_supervisor que lê o
-- GUC de teste `test.is_staff` (no banco real ele lê user_roles). Papel sempre por
-- SET LOCAL ROLE + request.jwt.claims — nunca superusuário para exercitar a RPC.
--
-- COMO RODA. Fixtures e asserções numa transação que termina em ROLLBACK (zero
-- efeito colateral, idempotente):
--   docker run --rm -d --name zapp-v2-mb-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-mb-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261013230006_monitoring_message_buckets.sql \
--     < supabase/tests/monitoring_message_buckets.sql
-- VERMELHO esperado sem a correção: o mesmo comando com -v sem_migration=1 falha
-- já em T1, porque public.get_monitoring_message_buckets não existe (42883).

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261013230006_monitoring_message_buckets.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão
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

-- Staff controlado por GUC: no banco real is_admin_or_supervisor lê user_roles.
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.is_staff', true), 'off') = 'on' $$;

CREATE TABLE public.messages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id             uuid,
  whatsapp_connection_id uuid,
  content                text,
  message_type           text,
  sender                 text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.t_cb75_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_ok THEN
    RAISE EXCEPTION 'FALHOU: %', p_msg;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Migration REAL sob teste
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
  \echo '### modo vermelho: migration sob teste NAO aplicada ###'
\else
  \i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — baldes de hora, contagem por direção, borda da janela
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-10-13 00:00:00-03' FROM generate_series(1, 3);
INSERT INTO public.messages (sender, created_at)
SELECT 'agent', timestamptz '2026-10-13 00:30:00-03' FROM generate_series(1, 2);
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-10-13 02:15:00-03' FROM generate_series(1, 5);
INSERT INTO public.messages (sender, created_at)
SELECT 'agent', timestamptz '2026-10-13 05:59:59-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-10-13 06:00:00-03' FROM generate_series(1, 1);

DO $$
DECLARE
  v_rec    record;
  v_cnt    int := 0;
  v_sum_in bigint := 0;
  v_sum_out bigint := 0;
  v_b00_in bigint; v_b00_out bigint;
  v_b02_in bigint;
  v_b05_out bigint;
  v_min    timestamptz;
BEGIN
  PERFORM set_config('test.is_staff', 'on', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOR v_rec IN
    SELECT * FROM public.get_monitoring_message_buckets(
      timestamptz '2026-10-13 00:00:00-03',
      timestamptz '2026-10-13 06:00:00-03',
      interval '1 hour')
  LOOP
    v_cnt := v_cnt + 1;
    v_sum_in := v_sum_in + v_rec.incoming;
    v_sum_out := v_sum_out + v_rec.outgoing;
    IF v_rec.bucket_start = timestamptz '2026-10-13 00:00:00-03' THEN
      v_b00_in := v_rec.incoming; v_b00_out := v_rec.outgoing;
    ELSIF v_rec.bucket_start = timestamptz '2026-10-13 02:00:00-03' THEN
      v_b02_in := v_rec.incoming;
    ELSIF v_rec.bucket_start = timestamptz '2026-10-13 05:00:00-03' THEN
      v_b05_out := v_rec.outgoing;
    END IF;
    v_min := least(coalesce(v_min, v_rec.bucket_start), v_rec.bucket_start);
  END LOOP;
  RESET ROLE;

  PERFORM public.t_cb75_assert(v_cnt = 6, 'T1: baldes=' || v_cnt || ' (esperado 6)');
  PERFORM public.t_cb75_assert(v_min = timestamptz '2026-10-13 00:00:00-03', 'T1: inicio balde=' || v_min);
  PERFORM public.t_cb75_assert(v_b00_in = 3 AND v_b00_out = 2, 'T1: balde 00h=' || v_b00_in || '/' || v_b00_out || ' (esperado 3/2)');
  PERFORM public.t_cb75_assert(v_b02_in = 5, 'T1: balde 02h incoming=' || v_b02_in || ' (esperado 5)');
  PERFORM public.t_cb75_assert(v_b05_out = 1, 'T1: balde 05h outgoing=' || v_b05_out || ' (esperado 1)');
  PERFORM public.t_cb75_assert(v_sum_in = 8 AND v_sum_out = 3, 'T1: totais=' || v_sum_in || '/' || v_sum_out || ' (esperado 8/3)');
  RAISE NOTICE 'T1 OK — hora cheia, direcao e borda da janela';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — 1.200 mensagens: soma completa (sem corte de 1.000)
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (sender, created_at)
SELECT CASE WHEN i <= 700 THEN 'contact' ELSE 'agent' END,
       timestamptz '2026-10-20 00:00:00-03' + ((i - 1) * interval '72 seconds')
FROM generate_series(1, 1200) AS i;

DO $$
DECLARE
  v_rec     record;
  v_cnt     int := 0;
  v_sum_in  bigint := 0;
  v_sum_out bigint := 0;
BEGIN
  PERFORM set_config('test.is_staff', 'on', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOR v_rec IN
    SELECT * FROM public.get_monitoring_message_buckets(
      timestamptz '2026-10-20 00:00:00-03',
      timestamptz '2026-10-21 00:00:00-03',
      interval '1 hour')
  LOOP
    v_cnt := v_cnt + 1;
    v_sum_in := v_sum_in + v_rec.incoming;
    v_sum_out := v_sum_out + v_rec.outgoing;
  END LOOP;
  RESET ROLE;

  PERFORM public.t_cb75_assert(v_sum_in = 700, 'T2: incoming=' || v_sum_in || ' (esperado 700)');
  PERFORM public.t_cb75_assert(v_sum_out = 500, 'T2: outgoing=' || v_sum_out || ' (esperado 500)');
  PERFORM public.t_cb75_assert(v_sum_in + v_sum_out = 1200, 'T2: total=' || (v_sum_in + v_sum_out) || ' (esperado 1200, o grafico cortava em 1000)');
  PERFORM public.t_cb75_assert(v_cnt = 24, 'T2: baldes=' || v_cnt || ' (esperado 24)');
  RAISE NOTICE 'T2 OK — soma de 1.200 mensagens sem corte de 1.000';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — ancoragem no fuso America/Sao_Paulo (hora cheia e dia civil local)
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-10-27 14:37:00-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-10-27 14:36:59-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'agent', timestamptz '2026-10-27 14:00:00-03' FROM generate_series(1, 1);

DO $$
DECLARE
  v_rec record;
  v_min timestamptz;
  v_in  bigint := 0;
  v_out bigint := 0;
  v_b14_in bigint; v_b14_out bigint;
  v_min_dia timestamptz;
BEGIN
  PERFORM set_config('test.is_staff', 'on', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOR v_rec IN
    SELECT * FROM public.get_monitoring_message_buckets(
      timestamptz '2026-10-27 14:37:00-03',
      timestamptz '2026-10-27 17:00:00-03',
      interval '1 hour')
  LOOP
    v_in := v_in + v_rec.incoming;
    v_out := v_out + v_rec.outgoing;
    IF v_rec.bucket_start = timestamptz '2026-10-27 14:00:00-03' THEN
      v_b14_in := v_rec.incoming; v_b14_out := v_rec.outgoing;
    END IF;
    v_min := least(coalesce(v_min, v_rec.bucket_start), v_rec.bucket_start);
  END LOOP;
  RESET ROLE;

  PERFORM public.t_cb75_assert(v_min = timestamptz '2026-10-27 14:00:00-03', 'T3: 1o balde de hora=' || v_min || ' (esperado 14:00-03)');
  PERFORM public.t_cb75_assert(v_b14_in = 1 AND v_b14_out = 0, 'T3: balde 14h=' || v_b14_in || '/' || v_b14_out || ' (14:36:59 e 14:00 ficam fora de p_from)');
  PERFORM public.t_cb75_assert(v_in = 1 AND v_out = 0, 'T3: totais=' || v_in || '/' || v_out || ' (esperado 1/0)');

  SET LOCAL ROLE authenticated;
  FOR v_rec IN
    SELECT * FROM public.get_monitoring_message_buckets(
      timestamptz '2026-10-27 14:37:00-03',
      timestamptz '2026-10-28 00:00:00-03',
      interval '1 day')
  LOOP
    v_min_dia := least(coalesce(v_min_dia, v_rec.bucket_start), v_rec.bucket_start);
  END LOOP;
  RESET ROLE;

  PERFORM public.t_cb75_assert(v_min_dia = timestamptz '2026-10-27 00:00:00-03', 'T3: 1o balde de dia=' || v_min_dia || ' (esperado meia-noite civil -03)');
  RAISE NOTICE 'T3 OK — ancora no fuso America/Sao_Paulo';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — bordas half-open: >= p_from e < p_to, cada mensagem em UM balde
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-11-03 14:37:29-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'contact', timestamptz '2026-11-03 14:37:30-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'agent', timestamptz '2026-11-03 14:39:59-03' FROM generate_series(1, 1);
INSERT INTO public.messages (sender, created_at)
SELECT 'agent', timestamptz '2026-11-03 14:40:00-03' FROM generate_series(1, 1);

DO $$
DECLARE
  v_rec record;
  v_in bigint := 0;
  v_out bigint := 0;
  v_b37_in bigint; v_b39_out bigint; v_b40_out bigint;
  v_min timestamptz;
BEGIN
  PERFORM set_config('test.is_staff', 'on', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOR v_rec IN
    SELECT * FROM public.get_monitoring_message_buckets(
      timestamptz '2026-11-03 14:37:30-03',
      timestamptz '2026-11-03 14:40:00-03',
      interval '1 minute')
  LOOP
    v_in := v_in + v_rec.incoming;
    v_out := v_out + v_rec.outgoing;
    IF v_rec.bucket_start = timestamptz '2026-11-03 14:37:00-03' THEN v_b37_in := v_rec.incoming; END IF;
    IF v_rec.bucket_start = timestamptz '2026-11-03 14:39:00-03' THEN v_b39_out := v_rec.outgoing; END IF;
    IF v_rec.bucket_start = timestamptz '2026-11-03 14:40:00-03' THEN v_b40_out := v_rec.outgoing; END IF;
    v_min := least(coalesce(v_min, v_rec.bucket_start), v_rec.bucket_start);
  END LOOP;
  RESET ROLE;

  PERFORM public.t_cb75_assert(v_min = timestamptz '2026-11-03 14:37:00-03', 'T7: 1o balde=' || v_min);
  PERFORM public.t_cb75_assert(v_in = 1, 'T7: incoming=' || v_in || ' (14:37:29 fora, 14:37:30 dentro)');
  PERFORM public.t_cb75_assert(v_out = 1, 'T7: outgoing=' || v_out || ' (14:40:00 fora, 14:39:59 dentro)');
  PERFORM public.t_cb75_assert(v_b37_in = 1, 'T7: balde 14:37 incoming=' || v_b37_in);
  PERFORM public.t_cb75_assert(v_b39_out = 1, 'T7: balde 14:39 outgoing=' || v_b39_out);
  PERFORM public.t_cb75_assert(coalesce(v_b40_out, 0) = 0, 'T7: balde 14:40 tinha mensagem de p_to');
  RAISE NOTICE 'T7 OK — bordas half-open';
END $$;

-- ---------------------------------------------------------------------------
-- T4/T5/T8 — autorização (anon, authenticated nao-staff, service_role)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_msg   text;
BEGIN
  -- T4 anon: barrado no GRANT
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now() - interval '1 hour', now(), interval '1 hour');
    v_state := null;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM public.t_cb75_assert(v_state = '42501', 'T4: anon state=' || coalesce(v_state, 'sem erro') || ' (' || coalesce(v_msg, '') || ')');
  RAISE NOTICE 'T4 OK — anon negado no GRANT';

  -- T5 authenticated nao-staff: barrado no guard interno
  PERFORM set_config('test.is_staff', 'off', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aaaa"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now() - interval '1 hour', now(), interval '1 hour');
    v_state := null;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM public.t_cb75_assert(v_state = '42501', 'T5: nao-staff state=' || coalesce(v_state, 'sem erro'));
  PERFORM public.t_cb75_assert(v_msg LIKE '%monitoring_staff_required%', 'T5: mensagem=' || coalesce(v_msg, ''));
  RAISE NOTICE 'T5 OK — authenticated fora do staff negado pelo guard';

  -- T8 service_role: sem caminho de servico para esta leitura
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now() - interval '1 hour', now(), interval '1 hour');
    v_state := null;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM public.t_cb75_assert(v_state = '42501', 'T8: service_role state=' || coalesce(v_state, 'sem erro'));
  RAISE NOTICE 'T8 OK — service_role negado (sem caminho de servico)';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — entradas inválidas abortam com 22023
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_msg   text;
  v_erro  boolean;
BEGIN
  PERFORM set_config('test.is_staff', 'on', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- bucket < 1 minuto
  BEGIN
    v_erro := false;
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now() - interval '1 hour', now(), interval '30 seconds');
  EXCEPTION WHEN others THEN v_erro := true; v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM public.t_cb75_assert(v_erro AND v_state = '22023', 'T6a: bucket curto state=' || coalesce(v_state, 'sem erro'));
  PERFORM public.t_cb75_assert(v_msg LIKE '%monitoring_invalid_bucket%', 'T6a: msg=' || coalesce(v_msg, ''));

  -- janela invertida
  BEGIN
    v_erro := false;
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now(), now() - interval '1 hour', interval '1 hour');
  EXCEPTION WHEN others THEN v_erro := true; v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM public.t_cb75_assert(v_erro AND v_state = '22023', 'T6b: janela invertida state=' || coalesce(v_state, 'sem erro'));

  -- janela larga demais (> 5000 baldes)
  BEGIN
    v_erro := false;
    PERFORM count(*) FROM public.get_monitoring_message_buckets(timestamptz '2020-01-01 00:00-03', timestamptz '2030-01-01 00:00-03', interval '1 minute');
  EXCEPTION WHEN others THEN v_erro := true; v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM public.t_cb75_assert(v_erro AND v_state = '22023', 'T6c: janela larga state=' || coalesce(v_state, 'sem erro'));
  PERFORM public.t_cb75_assert(v_msg LIKE '%monitoring_window_too_wide%', 'T6c: msg=' || coalesce(v_msg, ''));

  -- bucket nulo
  BEGIN
    v_erro := false;
    PERFORM count(*) FROM public.get_monitoring_message_buckets(now() - interval '1 hour', now(), null::interval);
  EXCEPTION WHEN others THEN v_erro := true; v_state := SQLSTATE;
  END;
  PERFORM public.t_cb75_assert(v_erro AND v_state = '22023', 'T6d: bucket nulo state=' || coalesce(v_state, 'sem erro'));

  RESET ROLE;
  RAISE NOTICE 'T6 OK — entradas invalidas abortam com 22023';
END $$;

\echo '### TODOS OS CENARIOS (T1-T8) PASSARAM ###'
ROLLBACK;
