-- talkx_cancel_em_voo_mantem_confirmacao.sql
-- R2-DB-014 / item 299 (P2) — prova, em PostgreSQL 17 descartável, de que o
-- CANCELAMENTO de campanha do Talk X deixa de descartar a confirmação do provedor
-- de um destinatário EM VOO.
--
-- POR QUE AQUI (e não em scripts/db-audit/*.test.sh): o inventário do CI
-- (scripts/ci/check-test-inventory.mjs) reprova todo .test.sh de scripts/db-audit
-- que não tenha passo em .github/workflows/db-guard.yml — e esse passo é do dono do
-- workflow. As suítes supabase/tests/*.sql rodam por glob, ficam no mesmo commit da
-- migration e o inventário não olha .sql.
--
-- O QUE PROVA (critério do cartão):
--   T1 cancelar com POST em voo preserva o destinatário em voo ('sending' + lease) e
--      fecha o pendente sem POST; a confirmação do provedor grava DEPOIS do cancel;
--   T2 desfecho incerto do provedor vira quarentena durável (outcome_unknown + contador);
--   T3 falha explícita do provedor é registrada (failed + contador);
--   T4 worker morto pós-POST: o sweeper resolve o em voo (nenhum efeito incerto sem trilha);
--   T5 ACL: EXECUTE de transition_talkx_campaign segue só para service_role;
--   TR o bloco `-- Rollback:` da migration EXECUTA e devolve o comportamento ANTERIOR
--      (o defeito volta: em voo descartado + recibo recusado) — é o que discrimina a correção.
--
-- COMO RODA. A superfície é criada À MÃO (roles, schema auth, as tabelas do Talk X
-- que as migrations ALTERam): só roda em Postgres descartável — no banco da tarefa as
-- roles, as FKs e as tabelas já existem.
--   docker run --rm -d --name zapp-v2-c299 -v "$PWD:/repo:ro" -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-c299 psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v raiz=/repo < supabase/tests/talkx_cancel_em_voo_mantem_confirmacao.sql
--   (`raiz=/repo` é o padrão: o mount acima põe a cópia em /repo; passe -v raiz=<caminho> se não)
-- VERDE: termina com os NOTICE 'Tn OK' / 'TR OK' e sem erro.
-- VERMELHO esperado SEM a correção (mesmo comando + `-v sem_migration=1`): falha já em
-- T1 ('T1 em voo preservado (status|token|POST) FALHOU: esperado sending|true|true,
-- veio cancelled|false|false'), porque sem a guarda de POST em voo o cancel descarta o
-- destinatário. Os ids sintéticos fixos (50/51…) não são de cliente nenhum.
\set ON_ERROR_STOP on

\if :{?raiz}
\else
  \set raiz /repo
\endif

-- -v sem_migration=1: NÃO aplica a correção sob teste (é o modo VERMELHO).
\if :{?sem_migration}
  \echo '=== VERMELHO: correção sob teste NÃO aplicada (sem_migration) ==='
\else
  \echo '=== VERDE: aplicando a correção sob teste ==='
\endif

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (o resto vem das MIGRATIONS REAIS, aplicadas por \i)
-- ---------------------------------------------------------------------------

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

-- shim mínimo do vault, exigido pela validação do corpo de get_talkx_send_url()
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text);
CREATE TABLE public.talkx_blacklist (contact_id uuid, phone text, removed_at timestamptz, expires_at timestamptz);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  message_template text NOT NULL DEFAULT 'Ola',
  total_recipients integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  launched_by uuid,
  launched_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  paused_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  scheduled_at timestamptz,
  schedule_timezone text,
  worker_id text,
  worker_lease_expires_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  whatsapp_connection_id uuid,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  external_id text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;


-- ---------------------------------------------------------------------------
-- MIGRATIONS REAIS (nada de copiar corpo de funcao) — estado ANTES da correcao
-- ---------------------------------------------------------------------------
\i :raiz/supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql
\i :raiz/supabase/migrations/20260911170000_add_talkx_campaign_completion_rpc.sql
\i :raiz/supabase/migrations/20260911180000_quarantine_talkx_unknown_provider_outcomes.sql
\i :raiz/supabase/migrations/20260911190000_account_for_talkx_unknown_provider_outcomes.sql
\i :raiz/supabase/migrations/20260911120000_talkx_e87_external_id_delivered.sql
\i :raiz/supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql
\i :raiz/supabase/migrations/20260930650000_talkx_v12_server_lifecycle_events.sql
\i :raiz/supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql

-- Correcao sob teste (o modo VERMELHO pula este passo):
\if :{?sem_migration}
\else
  \i :raiz/supabase/migrations/20261007000554_talkx_cancel_em_voo_mantem_confirmacao.sql
\endif


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
\! sed -n '/^-- CREATE OR REPLACE FUNCTION public.transition_talkx_campaign/,/^-- FIM DO ROLLBACK/p' /repo/supabase/migrations/20261007000554_talkx_cancel_em_voo_mantem_confirmacao.sql | sed 's/^-- \{0,1\}//; /FIM DO ROLLBACK/d; /^[[:space:]]*$/d' > /tmp/c299-rollback.sql
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
