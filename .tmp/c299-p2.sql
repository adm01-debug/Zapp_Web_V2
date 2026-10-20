
-- ---------------------------------------------------------------------------
-- Helpers: monta o cenário (campanha 'sending' com 1 pendente + 1 EM VOO) e
-- compara com mensagem própria. Criados como postgres (o papel do caller vem
-- depois, por SET ROLE service_role — o mesmo caminho da edge).
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.assert_igual(p_rotulo text, p_obtido text, p_esperado text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION '% FALHOU: esperado %, veio %', p_rotulo, p_esperado, COALESCE(p_obtido, '<nulo>');
  END IF;
  RAISE NOTICE '% OK: %', p_rotulo, p_obtido;
END $fn$;

CREATE FUNCTION pg_temp.prepara(p_cid uuid, p_pend uuid, p_voo uuid)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_token uuid;
BEGIN
  INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients)
    VALUES (p_cid, 'sending', 'Ola', 2);
  INSERT INTO public.talkx_recipients(id, campaign_id, status) VALUES
    (p_pend, p_cid, 'pending'),
    (p_voo,  p_cid, 'pending');
  PERFORM public.claim_talkx_recipient(p_cid, p_voo, 'edge-a', 90);
  SELECT delivery_claim_token INTO v_token FROM public.talkx_recipients WHERE id = p_voo;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'prepara: claim_talkx_recipient nao devolveu token';
  END IF;
  PERFORM public.mark_talkx_recipient_dispatch_started(p_voo, v_token);
  RETURN v_token;
END $fn$;

-- ── T1: cancelar com POST em voo preserva o em voo e grava a confirmação ─────
SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $t$
DECLARE
  v_cid   uuid := '50000000-0000-0000-0000-0000000000a1';
  v_pend  uuid := '51000000-0000-0000-0000-0000000000a1';
  v_voo   uuid := '51000000-0000-0000-0000-0000000000b1';
  v_token uuid;
  v_txt   text;
BEGIN
  v_token := pg_temp.prepara(v_cid, v_pend, v_voo);
  SELECT t.current_status INTO v_txt
    FROM public.transition_talkx_campaign(v_cid, 'cancel', NULL, NULL) t;
  PERFORM pg_temp.assert_igual('T1 cancel aplica', v_txt, 'cancelled');
  SELECT r.status || '|' || coalesce((r.delivery_claim_token = v_token)::text, 'token-nulo') || '|'
         || (r.provider_dispatch_started_at IS NOT NULL)::text
    INTO v_txt FROM public.talkx_recipients r WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T1 em voo preservado (status|token|POST)', v_txt, 'sending|true|true');
  SELECT r.status INTO v_txt FROM public.talkx_recipients r WHERE r.id = v_pend;
  PERFORM pg_temp.assert_igual('T1 pendente sem POST continua fechando', v_txt, 'cancelled');
  PERFORM public.record_talkx_recipient_sent(v_voo, v_token, 'prov-rec-green');
  SELECT r.status || '|' || r.external_id || '|' || c.sent_count INTO v_txt
    FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id
   WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T1 confirmação do provedor gravada após o cancel', v_txt, 'sent|prov-rec-green|1');
END $t$;

-- ── T2: desfecho INCERTO (timeout/5xx) vira quarentena durável ───────────────
DO $t$
DECLARE
  v_cid   uuid := '50000000-0000-0000-0000-0000000000a2';
  v_pend  uuid := '51000000-0000-0000-0000-0000000000a2';
  v_voo   uuid := '51000000-0000-0000-0000-0000000000b2';
  v_token uuid;
  v_txt   text;
BEGIN
  v_token := pg_temp.prepara(v_cid, v_pend, v_voo);
  PERFORM t.current_status FROM public.transition_talkx_campaign(v_cid, 'cancel', NULL, NULL) t;
  PERFORM public.complete_talkx_recipient(v_voo, v_token, 'outcome_unknown', 'Provider outcome unknown: HTTP 503');
  SELECT r.status || '|' || (r.error_message LIKE 'Provider outcome unknown%')::text || '|' || c.outcome_unknown_count
    INTO v_txt FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id
   WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T2 quarentena durável após cancel (status|erro|contador)', v_txt, 'outcome_unknown|true|1');
END $t$;

-- ── T3: falha EXPLÍCITA do provedor é registrada ─────────────────────────────
DO $t$
DECLARE
  v_cid   uuid := '50000000-0000-0000-0000-0000000000a3';
  v_pend  uuid := '51000000-0000-0000-0000-0000000000a3';
  v_voo   uuid := '51000000-0000-0000-0000-0000000000b3';
  v_token uuid;
  v_txt   text;
BEGIN
  v_token := pg_temp.prepara(v_cid, v_pend, v_voo);
  PERFORM t.current_status FROM public.transition_talkx_campaign(v_cid, 'cancel', NULL, NULL) t;
  PERFORM public.complete_talkx_recipient(v_voo, v_token, 'failed', 'Erro ao enviar');
  SELECT r.status || '|' || r.error_message || '|' || c.failed_count INTO v_txt
    FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id
   WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T3 falha explícita depois do cancel (status|erro|contador)', v_txt, 'failed|Erro ao enviar|1');
END $t$;

-- ── T4: worker MORTO pós-POST — o sweeper resolve o em voo ───────────────────
-- (a migration real que traz sweep_talkx_stuck_recipients aqui, como no laço do dia)
RESET ROLE;
\i :raiz/supabase/migrations/20261001391230_talkx_engine_tick.sql
SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $t$
DECLARE
  v_cid   uuid := '50000000-0000-0000-0000-0000000000a4';
  v_pend  uuid := '51000000-0000-0000-0000-0000000000a4';
  v_voo   uuid := '51000000-0000-0000-0000-0000000000b4';
  v_n     integer;
  v_txt   text;
BEGIN
  PERFORM pg_temp.prepara(v_cid, v_pend, v_voo);
  -- a edge morre: a lease vence sem ninguém concluir
  UPDATE public.talkx_recipients SET delivery_claim_expires_at = statement_timestamp() - interval '1 minute'
   WHERE id = v_voo;
  PERFORM t.current_status FROM public.transition_talkx_campaign(v_cid, 'cancel', NULL, NULL) t;
  SELECT r.status INTO v_txt FROM public.talkx_recipients r WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T4 em voo segue sending até o sweeper', v_txt, 'sending');
  SELECT public.sweep_talkx_stuck_recipients(50) INTO v_n;
  PERFORM pg_temp.assert_igual('T4 sweeper varreu o em voo', v_n::text, '1');
  SELECT r.status || '|' || c.outcome_unknown_count INTO v_txt
    FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id
   WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('T4 sweeper resolveu o destino em voo (status|contador)', v_txt, 'outcome_unknown|1');
END $t$;

-- ── T5: ACL — nada afrouxado (EXECUTE segue só para service_role) ────────────
RESET ROLE;

DO $t$
DECLARE
  v_txt text;
BEGIN
  SELECT has_function_privilege('service_role', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text
         || '|' ||
         has_function_privilege('authenticated', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text
         || '|' ||
         has_function_privilege('anon', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text
    INTO v_txt;
  PERFORM pg_temp.assert_igual('T5 servico|authenticated|anon', v_txt, 'true|false|false');
END $t$;

-- ── TR: o `-- Rollback:` da migration executa e devolve o comportamento ANTERIOR
-- (o defeito volta: em voo descartado + recibo recusado). O SQL do rollback é o
-- próprio bloco comentado da migration, extraído aqui — não é cópia à mão.
\! sed -n '/^-- CREATE OR REPLACE FUNCTION/,$p' /repo/supabase/migrations/20261007000554_talkx_cancel_em_voo_mantem_confirmacao.sql | sed 's/^-- \{0,1\}//' > /tmp/c299-rollback.sql
\i /tmp/c299-rollback.sql

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $t$
DECLARE
  v_cid   uuid := '50000000-0000-0000-0000-0000000000a9';
  v_pend  uuid := '51000000-0000-0000-0000-0000000000a9';
  v_voo   uuid := '51000000-0000-0000-0000-0000000000b9';
  v_token uuid;
  v_txt   text;
  v_erro  text;
BEGIN
  v_token := pg_temp.prepara(v_cid, v_pend, v_voo);
  PERFORM t.current_status FROM public.transition_talkx_campaign(v_cid, 'cancel', NULL, NULL) t;
  SELECT r.status || '|' || COALESCE(r.delivery_claim_token::text, 'NULL') INTO v_txt
    FROM public.talkx_recipients r WHERE r.id = v_voo;
  PERFORM pg_temp.assert_igual('TR defeito volta: em voo descartado (status|token)', v_txt, 'cancelled|NULL');
  BEGIN
    PERFORM public.record_talkx_recipient_sent(v_voo, v_token, 'prov-rollback');
  EXCEPTION WHEN others THEN
    v_erro := SQLERRM;
  END;
  IF v_erro IS NULL THEN
    RAISE EXCEPTION 'TR FALHOU: sem a correção o recibo deveria ser recusado (nenhum erro levantado)';
  END IF;
  IF position('talkx_delivery_claim_conflict' in v_erro) = 0 THEN
    RAISE EXCEPTION 'TR FALHOU: erro inesperado do recibo: %', v_erro;
  END IF;
  RAISE NOTICE 'TR OK: rollback restaura o defeito (recibo recusado: %)', v_erro;
END $t$;

RESET ROLE;

\echo 'VERDE: Talk X R2-DB-014 — cancelamento em voo preserva a confirmação do provedor e permite reconciliação'
