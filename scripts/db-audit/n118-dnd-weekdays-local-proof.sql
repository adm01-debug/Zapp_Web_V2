-- Prova N-118 (refazer): executa o SQL real no banco local da tarefa.
-- Uso: zapp-db-local psql . <nome> < este_arquivo
-- Tudo roda em UMA transação com ROLLBACK no fim (não deixa resíduo).
-- Cada bloco DO levanta NOTICE 'N118-PASS: ...' ou aborta com 'N118-FAIL'.
\set ON_ERROR_STOP on
BEGIN;

-- ============ A) helper: matriz de validação (ponto 2) ============
DO $$
DECLARE
  v_got smallint[];
BEGIN
  v_got := public.validate_talkx_send_weekdays('[1,2,3]'::jsonb, 'E');
  IF v_got <> '{1,2,3}'::smallint[] THEN RAISE EXCEPTION 'N118-FAIL helper válido: %', v_got; END IF;
  v_got := public.validate_talkx_send_weekdays('[1,1,2]'::jsonb, 'E');
  IF v_got <> '{1,2}'::smallint[] THEN RAISE EXCEPTION 'N118-FAIL helper dedupe: %', v_got; END IF;
  v_got := public.validate_talkx_send_weekdays('[]'::jsonb, 'E');
  IF v_got IS NOT NULL THEN RAISE EXCEPTION 'N118-FAIL helper [] deveria ser NULL: %', v_got; END IF;
  v_got := public.validate_talkx_send_weekdays(NULL, 'E');
  IF v_got IS NOT NULL THEN RAISE EXCEPTION 'N118-FAIL helper NULL: %', v_got; END IF;
  RAISE NOTICE 'N118-PASS A1 helper aceita válidos, dedupe, []=NULL, NULL=NULL';
END $$;

DO $$
BEGIN
  -- ["a"] tem de levantar o erro de DOMÍNIO, nunca o CAST cru
  BEGIN
    PERFORM public.validate_talkx_send_weekdays('["a"]'::jsonb, 'invalid_talkx_limits_values');
    RAISE EXCEPTION 'N118-FAIL helper ["a"] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_talkx_limits_values' THEN
      RAISE EXCEPTION 'N118-FAIL helper ["a"] mensagem errada: %', SQLERRM;
    END IF;
  END;
  -- [1.5] idem
  BEGIN
    PERFORM public.validate_talkx_send_weekdays('[1.5]'::jsonb, 'invalid_talkx_payload');
    RAISE EXCEPTION 'N118-FAIL helper [1.5] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_talkx_payload' THEN
      RAISE EXCEPTION 'N118-FAIL helper [1.5] mensagem errada: %', SQLERRM;
    END IF;
  END;
  -- [7] e [-1] fora de 0..6
  BEGIN
    PERFORM public.validate_talkx_send_weekdays('[7]'::jsonb, 'E');
    RAISE EXCEPTION 'N118-FAIL helper [7] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.validate_talkx_send_weekdays('[-1]'::jsonb, 'E');
    RAISE EXCEPTION 'N118-FAIL helper [-1] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  -- não-array
  BEGIN
    PERFORM public.validate_talkx_send_weekdays('"x"'::jsonb, 'E');
    RAISE EXCEPTION 'N118-FAIL helper não-array não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  RAISE NOTICE 'N118-PASS A2 helper rejeita ["a"]/[1.5]/[7]/[-1]/não-array com 22023 (sem 22P02)';
END $$;

-- ============ B) window_open: DND só com opt-in (ponto 2) ============
-- sexta 2026-10-02 12:00 UTC, DND 10:00–14:00
INSERT INTO public.talkx_settings (key, value)
VALUES ('dnd_hours', '{"start":"10:00","end":"14:00"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.talkx_campaigns (id, name, message_template, respect_dnd, send_weekdays)
VALUES ('11111111-1111-1111-1111-111111111111', 'N118 opt-out', 't', false, NULL),
       ('22222222-2222-2222-2222-222222222222', 'N118 opt-in', 't', true, NULL),
       ('33333333-3333-3333-3333-333333333333', 'N118 dias', 't', false, '{2,3,4}');

DO $$
DECLARE
  r record;
BEGIN
  -- B1: respect_dnd=false DENTRO do DND → aberta (o veto da recusa)
  SELECT * INTO r FROM public.talkx_campaign_window_open(
    '11111111-1111-1111-1111-111111111111', '2026-10-02T12:00:00Z');
  IF r.allowed IS NOT TRUE THEN RAISE EXCEPTION 'N118-FAIL B1 opt-out deveria abrir: %', row_to_json(r); END IF;
  -- B2: respect_dnd=true DENTRO do DND → fechada reason dnd
  SELECT * INTO r FROM public.talkx_campaign_window_open(
    '22222222-2222-2222-2222-222222222222', '2026-10-02T12:00:00Z');
  IF r.allowed IS NOT FALSE OR r.reason <> 'dnd' THEN RAISE EXCEPTION 'N118-FAIL B2 opt-in deveria fechar dnd: %', row_to_json(r); END IF;
  -- B3: respect_dnd=true FORA do DND → aberta
  SELECT * INTO r FROM public.talkx_campaign_window_open(
    '22222222-2222-2222-2222-222222222222', '2026-10-02T16:00:00Z');
  IF r.allowed IS NOT TRUE THEN RAISE EXCEPTION 'N118-FAIL B3 fora do DND deveria abrir: %', row_to_json(r); END IF;
  -- B4: sexta (5) fora de [2,3,4] → outside_weekdays
  SELECT * INTO r FROM public.talkx_campaign_window_open(
    '33333333-3333-3333-3333-333333333333', '2026-10-02T16:00:00Z');
  IF r.allowed IS NOT FALSE OR r.reason <> 'outside_weekdays' THEN RAISE EXCEPTION 'N118-FAIL B4 deveria fechar weekdays: %', row_to_json(r); END IF;
  -- B5: DND malformado fecha (fail-closed), não passa aberto
  UPDATE public.talkx_settings SET value = '{"start":"xx","end":"yy"}' WHERE key = 'dnd_hours';
  SELECT * INTO r FROM public.talkx_campaign_window_open(
    '22222222-2222-2222-2222-222222222222', '2026-10-02T16:00:00Z');
  IF r.allowed IS NOT FALSE OR r.reason <> 'dnd' THEN RAISE EXCEPTION 'N118-FAIL B5 DND malformado deveria fechar: %', row_to_json(r); END IF;
  UPDATE public.talkx_settings SET value = '{"start":"10:00","end":"14:00"}' WHERE key = 'dnd_hours';
  -- B6: campanha inexistente → P0002
  BEGIN
    PERFORM public.talkx_campaign_window_open('99999999-9999-9999-9999-999999999999', now());
    RAISE EXCEPTION 'N118-FAIL B6 deveria levantar not_found';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  RAISE NOTICE 'N118-PASS B window_open: opt-out abre, opt-in fecha, malformado fecha, weekdays ok';
END $$;

-- ============ C) sem overload obsoleto (regressão achada no refazer) ============
DO $$
DECLARE
  n_save int; n_upd int;
BEGIN
  SELECT count(*) INTO n_save FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'save_talkx_campaign_draft';
  SELECT count(*) INTO n_upd FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'update_talkx_campaign_limits';
  IF n_save <> 1 THEN RAISE EXCEPTION 'N118-FAIL C save tem % overloads (esperado 1)', n_save; END IF;
  IF n_upd <> 1 THEN RAISE EXCEPTION 'N118-FAIL C update tem % overloads (esperado 1)', n_upd; END IF;
  RAISE NOTICE 'N118-PASS C uma única assinatura de cada RPC (sem overload obsoleto 3-arg)';
END $$;

-- ============ D) save 4-arg + update aceitam os novos campos (JWT local) ============
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'n118@teste.local', '{"name":"N118"}')
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET is_active = true, name = 'N118'
 WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.user_roles (user_id, role)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_id uuid; v_rev bigint; v_replayed boolean;
  v_wd smallint[]; v_dnd boolean;
BEGIN
  -- D1: save cria com send_weekdays + respect_dnd
  SELECT * INTO v_id, v_rev, v_replayed FROM public.save_talkx_campaign_draft(
    NULL, NULL, gen_random_uuid(),
    '{"name":"N118 via save","message_template":"t","objective":"vendas","audience_source":"contacts","send_weekdays":[1,2,2],"respect_dnd":false}'::jsonb);
  SELECT send_weekdays, respect_dnd INTO v_wd, v_dnd
    FROM public.talkx_campaigns WHERE id = v_id;
  IF v_wd <> '{1,2}'::smallint[] THEN RAISE EXCEPTION 'N118-FAIL D1 weekdays gravado: %', v_wd; END IF;
  IF v_dnd IS NOT FALSE THEN RAISE EXCEPTION 'N118-FAIL D1 respect_dnd gravado: %', v_dnd; END IF;
  -- D2: save rejeita ["a"] com o erro de domínio vigente
  BEGIN
    PERFORM public.save_talkx_campaign_draft(
      NULL, NULL, gen_random_uuid(),
      '{"name":"x","message_template":"t","objective":"vendas","audience_source":"contacts","send_weekdays":["a"]}'::jsonb);
    RAISE EXCEPTION 'N118-FAIL D2 save ["a"] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_talkx_campaign_draft' THEN
      RAISE EXCEPTION 'N118-FAIL D2 mensagem errada: %', SQLERRM;
    END IF;
  END;
  -- D3: update altera os campos; inválido rejeita com o erro vigente
  SELECT * INTO v_id, v_rev FROM public.update_talkx_campaign_limits(
    v_id, v_rev, '{"send_weekdays":[5],"respect_dnd":true}'::jsonb);
  SELECT send_weekdays, respect_dnd INTO v_wd, v_dnd
    FROM public.talkx_campaigns WHERE id = v_id;
  IF v_wd <> '{5}'::smallint[] OR v_dnd IS NOT TRUE THEN
    RAISE EXCEPTION 'N118-FAIL D3 update gravou %, %', v_wd, v_dnd;
  END IF;
  BEGIN
    PERFORM public.update_talkx_campaign_limits(v_id, v_rev, '{"send_weekdays":[1.5]}'::jsonb);
    RAISE EXCEPTION 'N118-FAIL D3 update [1.5] não rejeitou';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_talkx_limits_values' THEN
      RAISE EXCEPTION 'N118-FAIL D3 mensagem errada: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'N118-PASS D save/update 4-arg gravam e rejeitam com erro de domínio';
END $$;

ROLLBACK;
