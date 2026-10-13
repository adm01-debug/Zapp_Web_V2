-- sla_open_rows_sweep
-- Prova no BANCO LOCAL da tarefa (schema real, com os papeis reais) que a varredura de SLA
-- de 1a resposta:
--   0) reproduz a INJURIA: a regra "so o dia corrente" (first_message_at >= date_trunc('day'))
--      nao enxerga a linha aberta VENCIDA de ontem — e a varredura nova enxerga e marca;
--   1) reavalia linha ABERTA vencida de dia anterior (first_response_at IS NULL + prazo
--      estourado), sem nenhum filtro de data -> marca first_response_breached=true e registra
--      o alerta 'breached' (o UPDATE e o que dispara o realtime do app);
--   2) abre a linha de um CICLO NOVO (cliente escreveu depois da ultima resposta efetiva) sem
--      duplicar por contato (indice parcial + ON CONFLICT);
--   3) avisa no limiar (warning) e nao avisa dentro do prazo; e idempotente (rodar de novo
--      nao cria linha nem alerta a mais);
--   4) nao e executavel por authenticated/anon.
-- Roda como postgres e troca de papel com SET LOCAL ROLE. Tudo em UMA transacao com ROLLBACK
-- ao fim: nao deixa residuo no banco.
--
-- Roda com: zapp-db-local psql . v2-261012230133f3 < supabase/tests/sla_open_rows_sweep.sql

BEGIN;
SET LOCAL session_replication_role = replica;  -- desliga gatilhos/FK so na fixture

-- Fixture sintetica (banco local descartavel da tarefa; nada de dado real).
INSERT INTO public.contacts (id, name, phone, company, job_title, contact_type, queue_id, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Varre A', '+550****0001', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000002', 'Varre B', '+550****0002', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000003', 'Varre C', '+550****0003', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000004', 'Varre D', '+550****0004', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000005', 'Varre E', '+550****0005', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000006', 'Varre F', '+550****0006', NULL, NULL, 'cliente', NULL, NULL),
  ('c0000000-0000-0000-0000-000000000007', 'Varre G', '+550****0007', NULL, NULL, 'cliente', NULL, NULL);

-- Prazo de 1a resposta fixo em 5 min por CONTATO (previsivel, independente do seed).
INSERT INTO public.sla_rules (name, first_response_minutes, resolution_minutes, priority, contact_id, is_active) VALUES
  ('varre-5-c1', 5, 60, 0, 'c0000000-0000-0000-0000-000000000001', true),
  ('varre-5-c2', 5, 60, 0, 'c0000000-0000-0000-0000-000000000002', true),
  ('varre-5-c3', 5, 60, 0, 'c0000000-0000-0000-0000-000000000003', true),
  ('varre-5-c4', 5, 60, 0, 'c0000000-0000-0000-0000-000000000004', true),
  ('varre-5-c5', 5, 60, 0, 'c0000000-0000-0000-0000-000000000005', true),
  ('varre-5-c6', 5, 60, 0, 'c0000000-0000-0000-0000-000000000006', true),
  ('varre-5-c7', 5, 60, 0, 'c0000000-0000-0000-0000-000000000007', true);

-- (a) C1: linha ABERTA vencida, 1a mensagem no DIA ANTERIOR (23h58) e ainda sem resposta.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
  VALUES ('c0000000-0000-0000-0000-000000000001',
          date_trunc('day', now()) - interval '2 minutes',
          NULL, false);

-- (b) C2: ciclo novo vencido (cliente escreveu 2h atras, ninguem respondeu, sem linha aberta).
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000002', 'contact', 'oi', 'delivered', now() - interval '2 hours', now() - interval '2 hours');

-- novato no limiar de aviso (5 min de prazo: faltam <= 1.5 min).
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000003', 'contact', 'oi', 'delivered', now() - interval '4 minutes', now() - interval '4 minutes');

-- dentro do prazo (30s): a varredura abre a linha mas NAO avisa.
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000004', 'contact', 'oi', 'delivered', now() - interval '30 seconds', now() - interval '30 seconds');

-- ciclo novo depois de uma resposta EFETIVA: contato -40min, atendente 'sent' -30min, contato -10min.
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000005', 'contact', 'oi', 'delivered', now() - interval '40 minutes', now() - interval '40 minutes'),
  ('c0000000-0000-0000-0000-000000000005', 'agent',   'ola', 'sent',     now() - interval '30 minutes', now() - interval '30 minutes'),
  ('c0000000-0000-0000-0000-000000000005', 'contact', 'voltei', 'delivered', now() - interval '10 minutes', now() - interval '10 minutes');

-- atendido: contato -30min, atendente 'sent' -20min -> nao ha ciclo pendente.
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000006', 'contact', 'oi', 'delivered', now() - interval '30 minutes', now() - interval '30 minutes'),
  ('c0000000-0000-0000-0000-000000000006', 'agent',   'ola', 'sent',     now() - interval '20 minutes', now() - interval '20 minutes');

-- resposta ainda 'sending' (NAO efetiva): o contato segue pendente (vencido, -8min).
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000007', 'contact', 'oi', 'delivered', now() - interval '9 minutes', now() - interval '9 minutes'),
  ('c0000000-0000-0000-0000-000000000007', 'agent',   'ola', 'sending',  now() - interval '8 minutes', NULL);

SET LOCAL session_replication_role = origin;

-- (0) INJURIA reproduzida: com a regra "so o dia corrente" a linha vencida de ontem (C1) fica
-- FORA do recorte do varredor.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM public.conversation_sla
   WHERE first_response_at IS NULL
     AND first_response_breached = false
     AND first_message_at >= date_trunc('day', now());
  IF n <> 0 THEN
    RAISE EXCEPTION 'injuria nao reproduzida: o recorte por dia ja enxergaria % linha(s) vencida(s)', n;
  END IF;
  RAISE NOTICE 'OK injuria: o recorte por dia enxerga 0 linhas vencidas (a de ontem some)';
END $$;

-- A varredura nova roda como o job do pg_cron (dono da funcao = postgres).
SELECT public.sla_first_response_sweep() AS acted;

-- (1) C1 (linha aberta de ONTEM) foi marcada e ganhou alerta 'breached'.
DO $$
DECLARE b boolean; n integer;
BEGIN
  SELECT first_response_breached INTO b
    FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000001' AND first_response_at IS NULL;
  IF b IS NOT TRUE THEN
    RAISE EXCEPTION 'linha aberta vencida de ontem NAO foi marcada como estourada';
  END IF;
  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000001'
     AND alert_type = 'first_response' AND severity = 'breached' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'esperava 1 alerta breached para C1, veio %', n; END IF;
  RAISE NOTICE 'OK C1: linha de ontem marcada + alerta breached';
END $$;

-- (2) C2: ciclo novo aberto, vencido e alertado; C3: aviso (warning), sem estouro;
--     C4: linha aberta, dentro do prazo, sem alerta.
DO $$
DECLARE b boolean; n integer;
BEGIN
  SELECT first_response_breached INTO b FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000002' AND first_response_at IS NULL;
  IF b IS NOT TRUE THEN RAISE EXCEPTION 'C2 deveria estar estourado'; END IF;
  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000002'
     AND alert_type = 'first_response' AND severity = 'breached' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'esperava 1 breached para C2, veio %', n; END IF;

  SELECT first_response_breached INTO b FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000003' AND first_response_at IS NULL;
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION 'C3 (limiar) nao deveria estourar'; END IF;
  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000003'
     AND alert_type = 'first_response' AND severity = 'warning' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'esperava 1 warning para C3, veio %', n; END IF;

  SELECT count(*) INTO n FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000004' AND first_response_at IS NULL
     AND first_response_breached IS NOT TRUE;
  IF n <> 1 THEN RAISE EXCEPTION 'C4 deveria ter linha aberta sem estouro'; END IF;
  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000004' AND resolved_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'C4 dentro do prazo nao deveria alertar, veio %', n; END IF;
  RAISE NOTICE 'OK C2/C3/C4: estouro, aviso e dentro-do-prazo';
END $$;

-- (3) C5: ciclo novo depois de resposta efetiva -> UMA linha aberta, com base na mensagem -10min;
--     C6 (atendido) sem linha aberta; C7 (resposta 'sending' nao efetiva) ainda pendente.
DO $$
DECLARE n integer; v_base timestamptz; b boolean;
BEGIN
  SELECT count(*), max(first_message_at) INTO n, v_base
    FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000005' AND first_response_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'C5 deveria ter EXATAMENTE 1 linha aberta, veio %', n; END IF;
  IF v_base > now() - interval '9 minutes' THEN
    RAISE EXCEPTION 'C5 deveria abrir ciclo na mensagem de -10min, base veio %', v_base;
  END IF;
  SELECT first_response_breached INTO b FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000005' AND first_response_at IS NULL;
  IF b IS NOT TRUE THEN RAISE EXCEPTION 'C5 (-10min > 5min) deveria estar estourado'; END IF;

  SELECT count(*) INTO n FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000006' AND first_response_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'C6 (atendido) nao deveria abrir linha, veio %', n; END IF;

  SELECT count(*) INTO n FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000007' AND first_response_at IS NULL
     AND first_response_breached IS TRUE;
  IF n <> 1 THEN RAISE EXCEPTION 'C7 (resposta sending) deveria seguir pendente/estourado'; END IF;
  RAISE NOTICE 'OK C5/C6/C7: ciclo novo unico, atendido fora, resposta sending nao efetiva';
END $$;

-- (4) Idempotencia: rodar a varredura de novo nao cria linha nem alerta a mais.
SELECT public.sla_first_response_sweep() AS acted_2;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.conversation_sla
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000005' AND first_response_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '2a passada duplicou a linha aberta de C5 (% linhas)', n; END IF;

  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000002'
     AND severity = 'breached' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '2a passada duplicou o alerta breached de C2 (% )', n; END IF;

  SELECT count(*) INTO n FROM public.sla_alert_events
   WHERE contact_id = 'c0000000-0000-0000-0000-000000000003'
     AND severity = 'warning' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '2a passada duplicou o alerta warning de C3 (% )', n; END IF;
  RAISE NOTICE 'OK idempotencia: rodar de novo nao duplica linha nem alerta';
END $$;

-- (5) Privilegios: a varredura nao e executavel por authenticated nem por anon.
DO $$
BEGIN
  IF to_regprocedure('public.sla_first_response_sweep(integer, interval)') IS NULL THEN
    RAISE EXCEPTION 'a varredura nao existe';
  END IF;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.sla_first_response_sweep();
    RAISE EXCEPTION 'authenticated NAO deveria poder chamar a varredura';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '42501' THEN RAISE; END IF;
    RAISE NOTICE 'OK authenticated sem EXECUTE (42501)';
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.sla_first_response_sweep();
    RAISE EXCEPTION 'anon NAO deveria poder chamar a varredura';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '42501' THEN RAISE; END IF;
    RAISE NOTICE 'OK anon sem EXECUTE (42501)';
  END;
  RESET ROLE;
END $$;

SELECT 'TODOS OS CASOS OK' AS resultado;
ROLLBACK;
