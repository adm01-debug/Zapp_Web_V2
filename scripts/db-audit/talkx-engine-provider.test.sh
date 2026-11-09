#!/usr/bin/env bash
#
# X034 — integração do MOTOR Talk X com provedor falso.
#
# Sobe um PostgreSQL 17 descartável, aplica as MIGRATIONS REAIS do repo que
# (re)criam as RPCs do motor sobre um schema mínimo (o mesmo padrão dos testes
# irmãos scripts/db-audit/talkx-regressoes-chain.test.sh e
# talkx-transition-overload-postgrest.test.sh), sobe um PostgREST REAL e roda
# supabase/functions/talkx-send/engine.integration.test.ts com:
#   - handleTalkxSend REAL contra banco + PostgREST de verdade;
#   - provedor Evolution FALSO (supabase/functions/_shared/__tests__/fake-evolution.ts).
#
# O provedor de PRODUÇÃO não é endereçado por nenhum caminho: EVOLUTION_API_URL
# aponta para o servidor local criado pelo próprio teste.
#
# Prova, entre outros:
#   (a) 60 destinatários em 3 invocações continue;
#   (b) morte simulada entre mark_dispatch_started e record_sent + sweep;
#   (c) pausa/retomada com o worker antigo vivo (CAP-102);
#   (d) suprimido no meio; (e) limite diário; (f) cancelamento no meio;
#   (g) agente tentando agendar; e a asserção final 0 telefone repetido e
#       sent + failed + skipped + outcome_unknown + cancelled = 60.
#
# Rode via o wrapper de PG descartável:
#   scripts/db-audit/retry-disposable-postgres-test.sh scripts/db-audit/talkx-engine-provider.test.sh
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
deno_test="$repo_root/supabase/functions/talkx-send/engine.integration.test.ts"

pg_image="${TALKX_ENGINE_PROVIDER_PG_IMAGE:-postgres:17-alpine}"
pgrst_image="${TALKX_ENGINE_PROVIDER_PGRST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}"
pg_name="zapp-talkx-engine-pg-$$"
pgrst_name="zapp-talkx-engine-pgrst-$$"
net_name="zapp-talkx-engine-net-$$"
jwt_secret="talkx-engine-provider-test-secret-32-chars"

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-engine-pg-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
  if [[ "$pgrst_name" =~ ^zapp-talkx-engine-pgrst-[0-9]+$ ]]; then
    docker rm -f "$pgrst_name" >/dev/null 2>&1 || true
  fi
  if [[ "$net_name" =~ ^zapp-talkx-engine-net-[0-9]+$ ]]; then
    docker network rm "$net_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
command -v deno >/dev/null 2>&1 || fail 'Deno nao esta instalado'

docker network create "$net_name" >/dev/null
docker run --rm -d --name "$pg_name" --network "$net_name" \
  -e POSTGRES_PASSWORD=engine_provider_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$pg_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$pg_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

pass 'PostgreSQL descartável no ar'

# ---------------------------------------------------------------------------
# Schema mínimo no estado ANTERIOR à cadeia: só os objetos que as migrations
# reais tocam. O resto (lease por destinatário, snapshots, worker_*, budget,
# colunas de concorrência) vem das PRÓPRIAS migrations aplicadas abaixo.
# ---------------------------------------------------------------------------
psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  -- PostgREST v14 publica as claims só em `request.jwt.claims` (JSON); o GUC
  -- legado `request.jwt.claim.role` fica vazio. Ler os dois cobre os dois mundos.
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user
  )::text
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT $1 = 'America/Sao_Paulo' $$;

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  instance_id text,
  name text,
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'contato',
  nickname text,
  phone text NOT NULL DEFAULT '',
  company text,
  city text, state text, email text,
  tags text[],
  assigned_to uuid,
  contact_type text,
  conversation_status text NOT NULL DEFAULT 'open',
  channel_type text, lead_origin text,
  consent_status text,
  lead_score integer, risk_score integer,
  ai_priority text, ai_sentiment text, group_category text,
  avatar_url text,
  visible boolean NOT NULL DEFAULT true,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = _contact_id AND (public.is_admin_or_supervisor(_user_id) OR c.visible)
  )
$$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'rascunho',
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'vendas',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_campaigns_status_check
    CHECK (status = ANY (ARRAY['draft','scheduled','sending','paused','completed','cancelled']))
);
-- V12 e o V80000 fazem DROP CONSTRAINT (sem IF EXISTS): a constraint precisa existir.
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  variant_id uuid,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_recipients_status_check
    CHECK (status = ANY (ARRAY['pending','sending','sent','delivered','failed','skipped','outcome_unknown']))
);
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  event_type text,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid, phone text, reason text,
  origin text NOT NULL DEFAULT 'manual',
  expires_at timestamptz, removed_at timestamptz
);
CREATE TABLE public.talkx_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid, slug text, label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_link_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid);
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY, name text NOT NULL, rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active', created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, name text NOT NULL, content text, media_url text, media_type text);
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '', media_url text, media_type text, weight integer NOT NULL DEFAULT 100
);
CREATE TABLE public.contact_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid, field_name text, field_value text
);
-- O orçamento da X018 soma envios do Multiplix na mesma conexão.
CREATE TABLE public.multiplix_dispatches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid);
CREATE TABLE public.multiplix_recipients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispatch_id uuid, sent_at timestamptz);

-- X033: tabela de log por destinatário (DDL idêntica à migration
-- 20261003242707). O motor grava nela ao fim de cada passada (best-effort).
CREATE TABLE public.talkx_delivery_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE CASCADE,
  attempt      integer NOT NULL DEFAULT 1,
  stage        text NOT NULL,
  outcome      text NOT NULL,
  http_status  integer,
  error_code   text,
  worker_id    text,
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_delivery_log_attempt_check CHECK (attempt >= 0),
  CONSTRAINT talkx_delivery_log_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT talkx_delivery_log_http_status_check CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT talkx_delivery_log_stage_check CHECK (stage IN ('claim', 'suppress_check', 'dispatch', 'complete', 'reconcile')),
  CONSTRAINT talkx_delivery_log_outcome_check CHECK (outcome IN ('sent', 'failed', 'outcome_unknown', 'skipped', 'rescheduled', 'no_claim', 'stopped'))
);

-- Stub fiel do Vault (get_talkx_cron_secret / get_instance_token).
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE,
  description text, secret text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text DEFAULT NULL)
  RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (new_name, new_secret, new_description)
    RETURNING id $$;

-- net.http_post trocado por tabela de captura: o tick/kick não toca a rede.
CREATE SCHEMA net;
CREATE TABLE net.http_capture (
  id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb,
  timeout_milliseconds integer, created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION net.http_post(
  url text, body jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE sql VOLATILE AS $$
  INSERT INTO net.http_capture (url, body, headers, timeout_milliseconds)
  VALUES (url, body, headers, timeout_milliseconds) RETURNING id
$$;

-- Stub do pg_cron suficiente para o alter_job idempotente do tick.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text, active boolean NOT NULL DEFAULT true);
CREATE FUNCTION cron.alter_job(
  job_id bigint, schedule text DEFAULT NULL, command text DEFAULT NULL,
  database text DEFAULT NULL, username text DEFAULT NULL, active boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cron.job
     SET schedule = COALESCE($2, cron.job.schedule),
         command  = COALESCE($3, cron.job.command),
         active   = COALESCE($6, cron.job.active)
   WHERE jobid = $1;
END;
$$;
INSERT INTO cron.job (jobname, schedule, command) VALUES
  ('talkx-scheduler-1min', '* * * * *', 'comando antigo');

-- Segredos de edge já existentes no Vault de produção (o tick os lê).
INSERT INTO vault.secrets (name, secret) VALUES
  ('talkx_anon_key', 'anon-key-de-teste'),
  ('talkx_scheduler_url', 'https://example.test/functions/v1/talkx-scheduler'),
  ('talkx_send_url', 'https://example.test/functions/v1/talkx-send');
SQL

# ---------------------------------------------------------------------------
# Cadeia REAL das migrations do motor, em ordem de versão.
# ---------------------------------------------------------------------------
chain=(
  "20260911120000_talkx_e87_external_id_delivered.sql"
  "20260911130000_add_talkx_recipient_delivery_leases.sql"
  "20260911150000_add_talkx_campaign_transition_rpc.sql"
  "20260911170000_add_talkx_campaign_completion_rpc.sql"
  "20260911180000_quarantine_talkx_unknown_provider_outcomes.sql"
  "20260911190000_account_for_talkx_unknown_provider_outcomes.sql"
  "20260912110000_harden_talkx_delivery_receipts.sql"
  "20260912120000_snapshot_talkx_recipient_messages.sql"
  "20260916210000_talkx_e91_resilience.sql"
  "20260925190000_whatsapp_connections_instance_token_vault.sql"
  "20260929420000_fix_talkx_transition_overload_and_status_check.sql"
  "20260930640000_talkx_v21_launch_flags.sql"
  "20260930650000_talkx_v12_server_lifecycle_events.sql"
  "20261001311230_talkx_campaign_worker_lease.sql"
  "20261001391230_talkx_engine_tick.sql"
  "20261002381230_talkx_role_gates.sql"
  "20261002551230_talkx_limits_ritmo.sql"
)
for name in "${chain[@]}"; do
  migration="$migrations_dir/$name"
  [[ -f "$migration" ]] || fail "migration ausente na cadeia: $name"
  psql_script < "$migration" >/dev/null || fail "cadeia: falhou ao aplicar $name"
done
pass "cadeia do motor aplicada (${#chain[@]} migrations)"

# ACL ampla para o service_role (o PostgREST fala como esse papel).
psql_script >/dev/null <<'SQL'
GRANT USAGE ON SCHEMA public, auth, vault, net, cron TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
SQL

# ---------------------------------------------------------------------------
# Fixtures (ids determinísticos, batendo com engine.integration.test.ts).
# ---------------------------------------------------------------------------
psql_script >/dev/null <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.whatsapp_connections (id, status, instance_id, name) VALUES
  ('90000000-0000-4000-8000-000000000001', 'connected', 'PRINCIPAL', 'Conexao A');

-- 76 contatos com telefone ÚNICO (a asserção final é 0 telefone repetido).
INSERT INTO public.contacts (id, name, phone)
SELECT ('30000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'Contato ' || g,
       '5511' || lpad((100000000 + g)::text, 9, '0')
  FROM generate_series(1, 76) g;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('max_per_minute_per_connection', '1000', 'sem teto por minuto no teste'),
  ('daily_limit_per_connection', '1000', 'teto diário alto no teste')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Campanhas: C1 = 60 destinatários; C2 morte+sweep; C3 worker; C4 suprimido;
-- C5 limite diário (conexão própria); C6 cancelamento; C7 draft (agente).
INSERT INTO public.talkx_campaigns
  (id, name, message_template, status, whatsapp_connection_id, total_recipients,
   send_interval_min, send_interval_max, typing_delay_min, typing_delay_max,
   schedule_timezone, business_hours_only, speed_profile)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'C1 integração', 'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 60, 0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000002', 'C2 morte',      'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 1,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000003', 'C3 worker',     'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 2,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000004', 'C4 suprimido',  'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 4,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000005', 'C5 limite',     'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 4,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000006', 'C6 cancelar',   'Ola {{nome}}', 'sending', '90000000-0000-4000-8000-000000000001', 4,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate'),
  ('40000000-0000-4000-8000-000000000007', 'C7 draft',      'Ola {{nome}}', 'draft',   '90000000-0000-4000-8000-000000000001', 1,  0, 0, 0, 0, 'America/Sao_Paulo', false, 'moderate');

-- Destinatários: C1 (1..60), C2 (61), C3 (62,63), C4 (64..67), C5 (68..71), C6 (72..75), C7 (76).
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, retry_after)
SELECT ('50000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       '40000000-0000-4000-8000-000000000001',
       ('30000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'pending',
       -- 1..20 elegíveis; 21..60 só entram quando o teste libera (retry_after futuro).
       CASE WHEN g <= 20 THEN NULL ELSE timestamptz '2100-01-01 00:00:00+00' END
  FROM generate_series(1, 60) g;

INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status) VALUES
  ('50000000-0000-4000-8000-000000000061', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000061', 'pending'),
  ('50000000-0000-4000-8000-000000000062', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000062', 'pending'),
  ('50000000-0000-4000-8000-000000000063', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000063', 'pending'),
  ('50000000-0000-4000-8000-000000000064', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000064', 'pending'),
  ('50000000-0000-4000-8000-000000000065', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000065', 'pending'),
  ('50000000-0000-4000-8000-000000000066', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000066', 'pending'),
  ('50000000-0000-4000-8000-000000000067', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000067', 'pending'),
  ('50000000-0000-4000-8000-000000000068', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000068', 'pending'),
  ('50000000-0000-4000-8000-000000000069', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000069', 'pending'),
  ('50000000-0000-4000-8000-000000000070', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000070', 'pending'),
  ('50000000-0000-4000-8000-000000000071', '40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000071', 'pending'),
  ('50000000-0000-4000-8000-000000000072', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000072', 'pending'),
  ('50000000-0000-4000-8000-000000000073', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000073', 'pending'),
  ('50000000-0000-4000-8000-000000000074', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000074', 'pending'),
  ('50000000-0000-4000-8000-000000000075', '40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000075', 'pending'),
  ('50000000-0000-4000-8000-000000000076', '40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000076', 'pending');

-- C6 só tem 72 e 73 elegíveis (74 e 75 entram depois do cancelamento).
UPDATE public.talkx_recipients SET retry_after = timestamptz '2100-01-01 00:00:00+00'
 WHERE id IN ('50000000-0000-4000-8000-000000000074', '50000000-0000-4000-8000-000000000075');

-- C4: o contato do 3º destinatário está na lista negra (suprimido no meio).
INSERT INTO public.talkx_blacklist (contact_id, reason, origin)
VALUES ('30000000-0000-4000-8000-000000000066', 'opt-out de teste', 'manual');
SQL
pass 'fixtures semeadas'

# Pré-pull do PostgREST com espera (o ECR limita pull anônimo).
for tentativa_pull in 1 2 3; do
  docker pull "$pgrst_image" >/dev/null 2>&1 && break
  echo "WARN: pull de $pgrst_image falhou (tentativa $tentativa_pull/3)" >&2
  sleep "$((tentativa_pull * 10))"
done
docker image inspect "$pgrst_image" >/dev/null 2>&1 \
  || fail "registro de imagens indisponivel ($pgrst_image)"

# PostgREST publicado em 127.0.0.1 (porta efêmera escolhida pelo docker).
docker run --rm -d --name "$pgrst_name" --network "$net_name" \
  -p 127.0.0.1::3000 \
  -e PGRST_DB_URI="postgres://postgres:engine_provider_test_only@$pg_name:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$jwt_secret" \
  -e PGRST_SERVER_PORT=3000 \
  "$pgrst_image" >/dev/null

host_port="$(docker port "$pgrst_name" 3000 | head -1 | sed -E 's/.*:([0-9]+)$/\1/')"
[[ -n "$host_port" ]] || fail 'não consegui descobrir a porta do PostgREST'
pgrest_url="http://127.0.0.1:$host_port"

postgrest_ready=false
for _ in $(seq 1 60); do
  if curl -sf "$pgrest_url/" >/dev/null 2>&1; then
    postgrest_ready=true
    break
  fi
  sleep 1
done
[[ "$postgrest_ready" == true ]] || fail 'PostgREST não subiu'
pass "PostgREST no ar em $pgrest_url"

jwt="$(JWT_SECRET="$jwt_secret" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b'=')
secret = os.environ['JWT_SECRET'].encode()
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
payload = b64(json.dumps({"role": "service_role", "exp": int(time.time()) + 3600}, separators=(',', ':')).encode())
signature = b64(hmac.new(secret, header + b'.' + payload, hashlib.sha256).digest())
print((header + b'.' + payload + b'.' + signature).decode())
PY
)"
anon_jwt="$(JWT_SECRET="$jwt_secret" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b'=')
secret = os.environ['JWT_SECRET'].encode()
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
payload = b64(json.dumps({"role": "authenticated", "sub": "20000000-0000-4000-8000-0000000000aa", "exp": int(time.time()) + 3600}, separators=(',', ':')).encode())
signature = b64(hmac.new(secret, header + b'.' + payload, hashlib.sha256).digest())
print((header + b'.' + payload + b'.' + signature).decode())
PY
)"

TALKX_ENGINE_POSTGREST_URL="$pgrest_url" \
TALKX_ENGINE_JWT="$jwt" \
TALKX_ENGINE_ANON_JWT="$anon_jwt" \
  deno test --config "$repo_root/scripts/ci/deno.json" --frozen \
    --allow-env --allow-read --allow-net=127.0.0.1 "$deno_test" \
  || fail 'engine.integration.test.ts falhou'

printf '[OK] X034 engine.provider: motor real contra Postgres+PostgREST descartáveis com provedor falso (60 destinatários, sweep, worker, supressão, limite diário, cancelamento, agente).\n'
