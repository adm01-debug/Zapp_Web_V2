-- multiplix_cota_conexao_itens_e_legado — prova do MX04 (#48), cartão t_b088f5ce.
--
-- O QUE PROVA (a correção da migration
-- supabase/migrations/20261006211601_mx04_cota_conexao_itens_e_legado.sql, que devolve os
-- DOIS corpos de cota por conexão: public.multiplix_connection_daily_usage e
-- public.talkx_connection_send_budget):
--
--   (0) as duas funções existem e a ACL é só de service_role (anon/authenticated negados);
--   (1) o consumo do Multiplix é 1 por ITEM enviado (mensagem), não por destinatário —
--         2 de 3 blocos consomem 2 (antes da correção: 0);
--   (2) N blocos do MESMO destinatário consomem N (mensagem, não destinatário);
--   (3) Talk X e Multiplix somam na MESMA conexão (o teto é compartilhado);
--   (4) o disparo LEGADO (fila por destinatário, sem itens) continua contando por destinatário;
--   (5) disparo COM itens não conta também pelos destinatários (nada duas vezes na virada);
--   (6) o consumo é por conexão: a conexão sem tráfego segue zerada;
--   (7) disparo/campanha SEM conexão carimbada consome a PRIMEIRA conexão conectada —
--         não a conexão marcada como padrão (is_default);
--   (8) duas leituras seguidas dão o mesmo número (reinvocação não renova saldo aparente);
--   (9) no limite exato (remaining = 0) o cron F17c NÃO retoma o disparo pausado por
--         'daily_limit'; com 1 de folga o MESMO cron retoma;
--  (10) medição inválida (teto ilegível ou grande demais) cai no default documentado da
--         função — 0 (fail-closed) no Multiplix, 6/minuto e 500/dia no Talk X — em vez de
--         levantar 22P02/22003, e 'remaining' nunca vem ausente nem não-numérico;
--  (11) quem não é service_role não lê nem executa a cota (tentativa real, não só ACL lida).
--
-- COMO RODA (banco LOCAL do cartão, nunca produção):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/multiplix_cota_conexao_itens_e_legado.sql
-- O arquivo roda como postgres, troca de papel dentro do bloco (SET LOCAL ROLE) e termina em
-- ROLLBACK: nenhuma fixture fica no banco. SEM a migration aplicada o teste FALHA já no passo
-- (1): a versão anterior da cota somava public.multiplix_recipients.sent_at, e o motor por item
-- (F32/F55) carimba public.multiplix_delivery_items.sent_at, nunca o destinatário — todo envio
-- por item desaparecia do teto compartilhado com o Talk X.
--
-- LIMITAÇÃO (registrada, não silenciada): aqui a autorização é provada por has_function_privilege
-- + tentativa real com SET ROLE (ACL do Postgres), não pelo caminho JWT/PostgREST.
-- As fixtures são todas do próprio arquivo (conexões, contato, campanha, disparos), com UUIDs
-- fixos: o resultado não depende de dado pré-existente no conjunto local.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  -- ── fixtures: conexões ──────────────────────────────────────────────────────
  -- P: a conexão PADRÃO (is_default), criada DEPOIS — tráfego sem carimbo não pode cair aqui.
  c_conn_p    constant uuid := '70000000-0000-0000-0000-000000000001';
  -- Q: conectada e NÃO padrão, criada antes: é a primeira connected pela ordem
  -- (created_at, id) — a que o worker escolhe quando o disparo não traz conexão.
  c_conn_q    constant uuid := '70000000-0000-0000-0000-000000000002';
  -- ── fixtures: Talk X ───────────────────────────────────────────────────────
  c_contato   constant uuid := '90000000-0000-0000-0000-000000000001';
  c_campanha  constant uuid := '30000000-0000-0000-0000-000000000201';
  c_rx_talkx  constant uuid := '40000000-0000-0000-0000-000000000201';
  -- ── fixtures: Multiplix ────────────────────────────────────────────────────
  c_operador  constant uuid := '10000000-0000-0000-0000-00000000000a';
  c_disp_item constant uuid := '30000000-0000-0000-0000-000000000101';
  c_disp_leg  constant uuid := '30000000-0000-0000-0000-000000000102';
  c_disp_mix  constant uuid := '30000000-0000-0000-0000-000000000103';
  c_disp_nulo constant uuid := '30000000-0000-0000-0000-000000000104';
  c_disp_paus constant uuid := '30000000-0000-0000-0000-000000000105';
  c_rec_item  constant uuid := '40000000-0000-0000-0000-000000000101';
  c_rec_mix   constant uuid := '40000000-0000-0000-0000-000000000103';
  c_rec_nulo  constant uuid := '40000000-0000-0000-0000-000000000105';
  c_rec_paus  constant uuid := '40000000-0000-0000-0000-000000000106';
  c_blk_1     constant uuid := '60000000-0000-0000-0000-000000000101';
  c_blk_2     constant uuid := '60000000-0000-0000-0000-000000000102';
  c_blk_3     constant uuid := '60000000-0000-0000-0000-000000000103';
  c_blk_mix   constant uuid := '60000000-0000-0000-0000-000000000104';
  c_blk_nulo1 constant uuid := '60000000-0000-0000-0000-000000000105';
  c_blk_nulo2 constant uuid := '60000000-0000-0000-0000-000000000106';
  c_item_1    constant uuid := '80000000-0000-0000-0000-000000000101';
  c_item_2    constant uuid := '80000000-0000-0000-0000-000000000102';
  c_item_3    constant uuid := '80000000-0000-0000-0000-000000000103';
  c_item_mix  constant uuid := '80000000-0000-0000-0000-000000000104';
  c_item_n1   constant uuid := '80000000-0000-0000-0000-000000000105';
  c_item_n2   constant uuid := '80000000-0000-0000-0000-000000000106';

  v_uso     jsonb;
  v_orc     jsonb;
  v_token   uuid;
  v_status  text;
  v_pausa   text;
  v_n       integer;
  v_uso_2   jsonb;
  v_orc_2   jsonb;
BEGIN
  -- ─────────────────────────────────────────────────────────────── 0) objetos e ACL
  IF (SELECT count(*)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('multiplix_connection_daily_usage', 'talkx_connection_send_budget')) <> 2 THEN
    RAISE EXCEPTION '(0) as duas funcoes de cota por conexao nao existem: a migration 20261006211601 nao esta aplicada';
  END IF;

  IF has_function_privilege('service_role', 'public.multiplix_connection_daily_usage(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION '(0) service_role NAO tem EXECUTE em multiplix_connection_daily_usage';
  END IF;
  IF has_function_privilege('service_role', 'public.talkx_connection_send_budget(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION '(0) service_role NAO tem EXECUTE em talkx_connection_send_budget';
  END IF;
  IF has_function_privilege('anon', 'public.multiplix_connection_daily_usage(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.multiplix_connection_daily_usage(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.talkx_connection_send_budget(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.talkx_connection_send_budget(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '(0) papel da API tem EXECUTE numa funcao de cota (esperado: so service_role)';
  END IF;
  IF EXISTS (SELECT 1
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('multiplix_connection_daily_usage', 'talkx_connection_send_budget')
                AND p.proacl::text ~ '(\{|,)=X/') THEN
    RAISE EXCEPTION '(0) alguma funcao de cota ficou com EXECUTE para PUBLIC';
  END IF;

  -- A sessão lê a cota como service_role (é o único papel autorizado no corpo das funções).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- ──────────────────────────────────────────────────────────────── (a) fixtures
  -- Conexões: Q nasce 2 dias ANTES de P e não é padrão (é a primeira connected).
  INSERT INTO public.whatsapp_connections (id, name, phone_number, instance_id, status, is_default, created_at)
  VALUES
    (c_conn_q, 'MX04 conexao Q (primeira conectada, nao padrao)', '+5500000000001', 'mx04-inst-q', 'connected', false, statement_timestamp() - interval '2 days'),
    (c_conn_p, 'MX04 conexao P (padrao)',                          '+5500000000002', 'mx04-inst-p', 'connected', true,  statement_timestamp());

  -- Premissa da fixture (7): a primeira conexão conectada pela ordem (created_at, id) é a Q.
  IF (SELECT connection.id FROM public.whatsapp_connections AS connection
       WHERE connection.status = 'connected'
       ORDER BY connection.created_at, connection.id LIMIT 1) IS DISTINCT FROM c_conn_q THEN
    RAISE EXCEPTION '(fixture) a primeira conexao conectada nao e a Q: a prova do trafego sem carimbo perde o sentido neste conjunto';
  END IF;

  -- Contato do Talk X (a FK talkx_recipients.contact_id é NOT NULL).
  INSERT INTO public.contacts (id, name, phone)
  VALUES (c_contato, 'MX04 contato sintetico', '+5500000000009');

  -- Disparo por ITEM: 3 blocos para UM destinatário = 3 itens na fila (F32a/F32b).
  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
  VALUES (c_disp_item, 'MX04 itens', 'Oi {{empresa}}', 'sending', c_operador, 1, c_conn_p);
  INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
    (c_blk_1, c_disp_item, 0, 'text', 'bloco 1'),
    (c_blk_2, c_disp_item, 1, 'text', 'bloco 2'),
    (c_blk_3, c_disp_item, 2, 'text', 'bloco 3');
  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, created_at)
  VALUES (c_rec_item, c_disp_item, gen_random_uuid(), '+5500000000011', 'pending', statement_timestamp());
  INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status) VALUES
    (c_item_1, c_disp_item, c_rec_item, c_blk_1, 1, 'pending'),
    (c_item_2, c_disp_item, c_rec_item, c_blk_2, 1, 'pending'),
    (c_item_3, c_disp_item, c_rec_item, c_blk_3, 1, 'pending');

  -- ─────────────────────── (1) item enviado entra na cota: 2 de 3 blocos -> sent 2
  -- Envio pelo caminho REAL do worker: claim -> POST iniciado -> carimbo 'sent' no ITEM.
  SELECT item.claim_token INTO v_token
    FROM public.claim_multiplix_item(c_disp_item, c_item_1, 'mx04-worker', 90) AS item;
  IF v_token IS NULL THEN
    RAISE EXCEPTION '(1) claim do item 1 nao devolveu claim_token';
  END IF;
  PERFORM public.mark_multiplix_item_dispatch_started(c_item_1, v_token);
  PERFORM public.record_multiplix_item_sent(c_item_1, v_token, 'mx04-ext-1');

  SELECT item.claim_token INTO v_token
    FROM public.claim_multiplix_item(c_disp_item, c_item_2, 'mx04-worker', 90) AS item;
  IF v_token IS NULL THEN
    RAISE EXCEPTION '(1) claim do item 2 nao devolveu claim_token';
  END IF;
  PERFORM public.mark_multiplix_item_dispatch_started(c_item_2, v_token);
  PERFORM public.record_multiplix_item_sent(c_item_2, v_token, 'mx04-ext-2');

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'limit') <> '500' OR (v_uso ->> 'sent') <> '2' OR (v_uso ->> 'remaining') <> '498' THEN
    RAISE EXCEPTION '(1) cota do dia apos 2 itens: esperado 500:2:498, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;
  IF jsonb_typeof(v_uso -> 'remaining') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '(1) remaining da cota do dia nao veio numerico (tipo: %)', COALESCE(jsonb_typeof(v_uso -> 'remaining'), 'ausente');
  END IF;

  v_orc := public.talkx_connection_send_budget(c_conn_p);
  IF (v_orc ->> 'day_sent') <> '2' OR (v_orc ->> 'minute_sent') <> '2' OR (v_orc ->> 'day_limit') <> '500' THEN
    RAISE EXCEPTION '(1) orcamento do Talk X apos 2 itens: esperado dia=2 minuto=2 teto=500, obtido dia=% minuto=% teto=%',
      v_orc ->> 'day_sent', v_orc ->> 'minute_sent', v_orc ->> 'day_limit';
  END IF;

  -- ─────────────────── (2) N blocos do MESMO destinatario consomem N (mensagem)
  SELECT item.claim_token INTO v_token
    FROM public.claim_multiplix_item(c_disp_item, c_item_3, 'mx04-worker', 90) AS item;
  IF v_token IS NULL THEN
    RAISE EXCEPTION '(2) claim do item 3 nao devolveu claim_token';
  END IF;
  PERFORM public.mark_multiplix_item_dispatch_started(c_item_3, v_token);
  PERFORM public.record_multiplix_item_sent(c_item_3, v_token, 'mx04-ext-3');

  SELECT count(DISTINCT item.recipient_id) INTO v_n
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = c_disp_item AND item.sent_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '(fixture) o disparo por item deveria ter UM destinatario carimbado, tem %', v_n;
  END IF;
  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'sent') <> '3' THEN
    RAISE EXCEPTION '(2) 3 blocos de 1 destinatario deveriam consumir 3, consumiram %', v_uso ->> 'sent';
  END IF;

  -- ─────────────────── (3) Talk X e Multiplix somam na MESMA conexao (teto compartilhado)
  INSERT INTO public.talkx_campaigns (id, name, message_template, whatsapp_connection_id)
  VALUES (c_campanha, 'MX04 campanha', 'Oi', c_conn_p);
  INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, sent_at)
  VALUES (c_rx_talkx, c_campanha, c_contato, 'sent', statement_timestamp());

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'sent') <> '4' OR (v_uso ->> 'remaining') <> '496' THEN
    RAISE EXCEPTION '(3) Talk X nao somou com o Multiplix na mesma conexao: esperado sent=4 remaining=496, obtido sent=% remaining=%',
      v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;
  v_orc := public.talkx_connection_send_budget(c_conn_p);
  IF (v_orc ->> 'day_sent') <> '4' THEN
    RAISE EXCEPTION '(3) orcamento do Talk X deveria ver 4 (3 itens + 1 Talk X), viu %', v_orc ->> 'day_sent';
  END IF;

  -- ─────────────────── (4) legado (fila por destinatario, sem itens) continua contando
  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
  VALUES (c_disp_leg, 'MX04 legado', 'Oi', 'completed', c_operador, 4, c_conn_p);
  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, sent_at)
  SELECT gen_random_uuid(), c_disp_leg, gen_random_uuid(), '+550000000001' || lpad(g::text, 2, '0'), 'sent', statement_timestamp()
    FROM generate_series(1, 4) AS g;

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'sent') <> '8' THEN
    RAISE EXCEPTION '(4) legado por destinatario deveria somar 4 (total 8), total ficou %', v_uso ->> 'sent';
  END IF;

  -- ─────── (5) disparo COM itens nao conta tambem pelos destinatarios (nada duas vezes)
  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
  VALUES (c_disp_mix, 'MX04 misto', 'Oi', 'completed', c_operador, 2, c_conn_p);
  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, sent_at) VALUES
    (c_rec_mix, c_disp_mix, gen_random_uuid(), '+5500000000012', 'sent', statement_timestamp()),
    ('40000000-0000-0000-0000-000000000104', c_disp_mix, gen_random_uuid(), '+5500000000013', 'sent', statement_timestamp());
  INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text)
  VALUES (c_blk_mix, c_disp_mix, 0, 'text', 'bloco misto');
  INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, sent_at)
  VALUES (c_item_mix, c_disp_mix, c_rec_mix, c_blk_mix, 1, 'sent', statement_timestamp());

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'sent') <> '9' THEN
    RAISE EXCEPTION '(5) disparo com itens contou duas vezes: 2 destinatarios + 1 item no MESMO disparo deveria dar 1 (total 9), total ficou %',
      v_uso ->> 'sent';
  END IF;

  -- ──────────────── (6) o consumo e por conexao: a conexao Q (sem trafego) segue zerada
  v_uso := public.multiplix_connection_daily_usage(c_conn_q);
  IF (v_uso ->> 'limit') <> '500' OR (v_uso ->> 'sent') <> '0' OR (v_uso ->> 'remaining') <> '500' THEN
    RAISE EXCEPTION '(6) conexao sem trafego deveria estar zerada: obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;

  -- ── (7) disparo SEM conexao carimbada consome a PRIMEIRA conectada, nao a padrao
  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
  VALUES (c_disp_nulo, 'MX04 sem conexao', 'Oi', 'completed', c_operador, 1, NULL);
  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status)
  VALUES (c_rec_nulo, c_disp_nulo, gen_random_uuid(), '+5500000000014', 'pending');
  INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
    (c_blk_nulo1, c_disp_nulo, 0, 'text', 'bloco sem conexao'),
    (c_blk_nulo2, c_disp_nulo, 1, 'text', 'bloco sem conexao 2');
  INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, sent_at) VALUES
    (c_item_n1, c_disp_nulo, c_rec_nulo, c_blk_nulo1, 1, 'sent', statement_timestamp()),
    (c_item_n2, c_disp_nulo, c_rec_nulo, c_blk_nulo2, 1, 'sent', statement_timestamp());

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'sent') <> '9' THEN
    RAISE EXCEPTION '(7) trafego sem conexao foi cobrado da conexao PADRAO por engano: esperado 9, obtido %', v_uso ->> 'sent';
  END IF;
  v_uso := public.multiplix_connection_daily_usage(c_conn_q);
  IF (v_uso ->> 'limit') <> '500' OR (v_uso ->> 'sent') <> '2' OR (v_uso ->> 'remaining') <> '498' THEN
    RAISE EXCEPTION '(7) trafego sem conexao nao foi cobrado da PRIMEIRA conectada (Q): esperado 500:2:498, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;

  -- ───────────────────────────── (8) mesma leitura duas vezes (saldo nao se renova sozinho)
  v_uso  := public.multiplix_connection_daily_usage(c_conn_p);
  v_uso_2 := public.multiplix_connection_daily_usage(c_conn_p);
  IF v_uso IS DISTINCT FROM v_uso_2 THEN
    RAISE EXCEPTION '(8) duas leituras seguidas da cota divergiram: % x %', v_uso, v_uso_2;
  END IF;
  v_orc   := public.talkx_connection_send_budget(c_conn_p);
  v_orc_2 := public.talkx_connection_send_budget(c_conn_p);
  IF v_orc IS DISTINCT FROM v_orc_2 THEN
    RAISE EXCEPTION '(8) duas leituras seguidas do orcamento do Talk X divergiram: % x %', v_orc, v_orc_2;
  END IF;

  -- ──── (9) limite exato esgota a cota e o cron NAO retoma o disparo pausado por daily_limit
  -- Fecha a fila da fixture para o cron não mexer nela (e nada mais é 'sending').
  UPDATE public.multiplix_dispatches SET status = 'completed' WHERE id = c_disp_item;
  UPDATE public.talkx_settings SET value = '9'::jsonb WHERE key = 'daily_limit_per_connection';

  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, pause_reason, whatsapp_connection_id)
  VALUES (c_disp_paus, 'MX04 pausado por cota', 'Oi', 'paused', c_operador, 1, 'daily_limit', c_conn_p);
  -- A retomada (transition_multiplix_dispatch 'start') exige destinatario no disparo; sem esta
  -- linha o cron falharia por 'multiplix_dispatch_recipients_required' — motivo alheio à cota.
  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status)
  VALUES (c_rec_paus, c_disp_paus, gen_random_uuid(), '+5500000000015', 'pending');

  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'limit') <> '9' OR (v_uso ->> 'sent') <> '9' OR (v_uso ->> 'remaining') <> '0' THEN
    RAISE EXCEPTION '(9) no limite exato o remaining deveria ser 0: esperado 9:9:0, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;

  PERFORM public.trigger_pending_multiplix_dispatches();
  SELECT dispatch.status::text, COALESCE(dispatch.pause_reason, 'null') INTO v_status, v_pausa
    FROM public.multiplix_dispatches AS dispatch WHERE dispatch.id = c_disp_paus;
  IF v_status <> 'paused' OR v_pausa <> 'daily_limit' THEN
    RAISE EXCEPTION '(9) F17c retomou o disparo com a cota do dia esgotada (status: %)', v_status || ':' || v_pausa;
  END IF;

  -- ───────────────────── (10) com um envio de folga o MESMO cron retoma o disparo
  UPDATE public.talkx_settings SET value = '10'::jsonb WHERE key = 'daily_limit_per_connection';
  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'limit') <> '10' OR (v_uso ->> 'sent') <> '9' OR (v_uso ->> 'remaining') <> '1' THEN
    RAISE EXCEPTION '(10) com folga o remaining deveria ser 1: esperado 10:9:1, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;

  PERFORM public.trigger_pending_multiplix_dispatches();
  SELECT dispatch.status::text INTO v_status FROM public.multiplix_dispatches AS dispatch WHERE dispatch.id = c_disp_paus;
  IF v_status <> 'sending' THEN
    RAISE EXCEPTION '(10) F17c nao retomou o disparo pausado por cota com remaining > 0 (status: %)', v_status;
  END IF;

  -- ───── (11) medicao invalida: default da funcao (fail-closed) e remaining sempre numerico
  INSERT INTO public.talkx_settings (key, value, description)
  VALUES ('max_per_minute_per_connection', '6'::jsonb, 'Teto de mensagens por minuto por conexao WhatsApp (Talk X + Multiplix)')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  UPDATE public.talkx_settings SET value = '3000000000'::jsonb
   WHERE key IN ('daily_limit_per_connection', 'max_per_minute_per_connection');

  -- Multiplix: teto fora do inteiro seguro -> default 0 (fail-closed). Antes da correção a
  -- chamada inteira levantava 22003 (integer out of range) e o worker tratava como erro.
  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'limit') <> '0' OR (v_uso ->> 'sent') <> '9' OR (v_uso ->> 'remaining') <> '0' THEN
    RAISE EXCEPTION '(11) teto gigante deveria fechar em 0 (fail-closed): esperado 0:9:0, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;
  IF jsonb_typeof(v_uso -> 'remaining') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '(11) remaining ausente/nao-numerico com teto gigante (tipo: %)', COALESCE(jsonb_typeof(v_uso -> 'remaining'), 'ausente');
  END IF;

  -- Talk X: teto gigante -> default documentado da funcao (6/minuto, 500/dia).
  v_orc := public.talkx_connection_send_budget(c_conn_p);
  IF (v_orc ->> 'day_sent') <> '9' OR (v_orc ->> 'minute_sent') <> '9' OR (v_orc ->> 'day_limit') <> '500'
     OR (v_orc ->> 'minute_limit') <> '6' THEN
    RAISE EXCEPTION '(11) defaults do orcamento com medicao invalida divergiram: dia=% minuto=% teto_dia=% teto_minuto=%',
      v_orc ->> 'day_sent', v_orc ->> 'minute_sent', v_orc ->> 'day_limit', v_orc ->> 'minute_limit';
  END IF;
  IF jsonb_typeof(v_orc -> 'day_remaining') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_orc -> 'minute_remaining') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '(11) orcamento com medicao invalida devolveu remaining ausente/nao-numerico';
  END IF;

  UPDATE public.talkx_settings SET value = '500'::jsonb WHERE key = 'daily_limit_per_connection';
  UPDATE public.talkx_settings SET value = '6'::jsonb WHERE key = 'max_per_minute_per_connection';
  v_uso := public.multiplix_connection_daily_usage(c_conn_p);
  IF (v_uso ->> 'limit') <> '500' OR (v_uso ->> 'sent') <> '9' OR (v_uso ->> 'remaining') <> '491' THEN
    RAISE EXCEPTION '(11) cotas restauradas divergiram: esperado 500:9:491, obtido %:%:%',
      v_uso ->> 'limit', v_uso ->> 'sent', v_uso ->> 'remaining';
  END IF;

  -- ──────────── (12) quem nao e service_role nao le nem executa a cota (tentativa REAL)
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.multiplix_connection_daily_usage(c_conn_p);
    RAISE EXCEPTION '(12) anon conseguiu executar a cota do Multiplix';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  BEGIN
    PERFORM public.talkx_connection_send_budget(c_conn_p);
    RAISE EXCEPTION '(12) anon conseguiu executar o orcamento do Talk X';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.multiplix_connection_daily_usage(c_conn_p);
    RAISE EXCEPTION '(12) authenticated conseguiu executar a cota do Multiplix';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  BEGIN
    PERFORM public.talkx_connection_send_budget(c_conn_p);
    RAISE EXCEPTION '(12) authenticated conseguiu executar o orcamento do Talk X';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;
  RESET ROLE;

  RAISE NOTICE 'MX04: suite OK — cota soma ITENS (1 por mensagem), legado sem contar duas vezes, teto compartilhado com o Talk X, trafego sem carimbo cobrado da primeira conectada, medicao invalida fail-closed com remaining sempre numerico, cron F17c adia no limite exato e so service_role le a cota';
END $$;

ROLLBACK;
