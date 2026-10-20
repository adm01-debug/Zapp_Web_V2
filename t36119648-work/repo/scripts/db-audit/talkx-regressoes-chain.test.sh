#!/usr/bin/env bash
# talkx-regressoes-chain — auditoria das DUAS regressoes de banco do Talk X.
#
# Aplica a CADEIA COMPLETA das migrations Talk X que (re)criam as duas funcoes,
# do zero, em ordem de versao (o padrao dos harnesses irmaos: schema minimo com os
# objetos que as migrations tocam, depois os arquivos REAIS de migration, um a um):
#
#   save_talkx_campaign_draft: 20260912130000 -> V21(20260930640000) -> V23(20260930770000)
#     -> V25(20261001271230) -> X009(20261001281230) -> V26(20261001291230)
#     -> X014(20261002381230) -> X017(20261002421230)
#   transition_talkx_campaign: 20260911150000 -> e91(20260916210000) -> 20260929420000
#     -> V21(20260930640000) -> V12(20260930650000) -> X010(20261001311230)
#
# Prova:
#   (RED)  a cadeia VIVA reproduz as regressoes:
#     A) save_talkx_campaign_draft IGNORA template_version_id (coluna fica NULL);
#     B) transition_talkx_campaign('start') deixa launched_by/launched_at NULL.
#   (GREEN) a migration de correcao (20261002431230_talkx_regressoes_fix.sql) restaura:
#     A) template_version_id gravado no INSERT, no UPDATE e na idempotencia da criacao;
#     B) launched_by = p_actor_id e launched_at preenchido no start, preservados no
#        replay idempotente e nao tocados em pause/cancel.
#   (replay) a migration de correcao e idempotente.
#
# Rode via o wrapper de PG descartavel:
#   scripts/db-audit/retry-disposable-postgres-test.sh scripts/db-audit/talkx-regressoes-chain.test.sh
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
fix_migration="$migrations_dir/20261002431230_talkx_regressoes_fix.sql"
postgres_image="${TALKX_REGRESSOES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-regressoes-chain-test-$$"
test_password="talkx_regressoes_chain_test_only"

# Cadeia completa (ordem de versao) das migrations que (re)criam as duas funcoes.
chain=(
  "20260911150000_add_talkx_campaign_transition_rpc.sql"
  "20260912130000_harden_talkx_draft_save.sql"
  "20260916210000_talkx_e91_resilience.sql"
  "20260924100000_revoke_anon_talkx_rpc_grants.sql"
  "20260929420000_fix_talkx_transition_overload_and_status_check.sql"
  "20260930640000_talkx_v21_launch_flags.sql"
  "20260930650000_talkx_v12_server_lifecycle_events.sql"
  "20260930770000_talkx_v23_draft_step.sql"
  "20261001271230_talkx_v25_campaign_owner.sql"
  "20261001281230_talkx_campaigns_draft_step_responsible.sql"
  "20261001291230_talkx_v26_template_version.sql"
  "20261001311230_talkx_campaign_worker_lease.sql"
  "20261002381230_talkx_role_gates.sql"
  "20261002391230_talkx_audience_rpc.sql"
  "20261002421230_talkx_audience_snapshot.sql"
)

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'
admin_profile='10000000-0000-0000-0000-000000000001'
actor_profile='10000000-0000-0000-0000-000000000002'
template_id='70000000-0000-0000-0000-000000000001'
version_1='80000000-0000-0000-0000-000000000001'
version_2='80000000-0000-0000-0000-000000000002'
creator_contact='30000000-0000-0000-0000-000000000001'

# ---------------------------------------------------------------------------
# Schema minimo no estado ANTERIOR a cadeia (o "do zero"): so os objetos que as
# migrations tocam. As colunas que a cadeia cria (draft_creation_key, revision,
# draft_step, owner, responsible_id, template_version_id, worker_*,
# launched_by/at, respect_suppression, confirm_consent, pause_reason) NAO entram
# aqui — quem as cria sao as proprias migrations reais.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

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

CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, status text NOT NULL, instance_id text);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'contato',
  nickname text,
  phone text NOT NULL DEFAULT '',
  company text,
  city text,
  state text,
  email text,
  tags text[],
  assigned_to uuid,
  contact_type text,
  conversation_status text NOT NULL DEFAULT 'open',
  channel_type text,
  lead_origin text,
  consent_status text,
  lead_score integer,
  risk_score integer,
  ai_priority text,
  ai_sentiment text,
  group_category text,
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

-- talkx_campaigns: estado legado (pre-12130000). A cadeia adiciona o resto.
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
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
-- V12 faz DROP CONSTRAINT talkx_recipients_status_check (sem IF EXISTS): a constraint
-- precisa existir no estado legado.
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
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

-- Objetos que a X014 toca.
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL, description text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.talkx_settings TO anon, authenticated, service_role;
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid, phone text, reason text,
  origin text NOT NULL DEFAULT 'manual', expires_at timestamptz, removed_at timestamptz
);
CREATE TABLE public.talkx_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid);
CREATE TABLE public.talkx_link_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid);

-- X016: indice sobre contacts(id) com phone ^[0-9]{10,15}$ (colunas ja na tabela).
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY, name text NOT NULL, rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active', created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
-- V26: FK de template_version_id aponta para talkx_template_versions(id).
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'draft',
  media_url text, media_type text,
  tags text[] NOT NULL DEFAULT '{}',
  custom_variables text[] NOT NULL DEFAULT '{}',
  saved_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  description text
);

-- X010: stub fiel do Vault (get_talkx_cron_secret le vault.decrypted_secrets).
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

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');
INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'connected', 'evolution-live');
INSERT INTO public.contacts (id, name, phone) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Ana', '5511900000001');
INSERT INTO public.talkx_templates (id, name) VALUES
  ('70000000-0000-0000-0000-000000000001', 'Template audit');
INSERT INTO public.talkx_template_versions
  (id, template_id, version_number, name, content) VALUES
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, 'v1', 'Ola {{nome}}'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 2, 'v2', 'Oi {{nome}}');

GRANT USAGE ON SCHEMA public, auth, vault TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts, public.talkx_segments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_campaigns TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# (0) aplica a CADEIA COMPLETA das migrations Talk X, em ordem de versao.
# ---------------------------------------------------------------------------
for name in "${chain[@]}"; do
  migration="$migrations_dir/$name"
  [[ -f "$migration" ]] || fail "migration ausente na cadeia: $name"
  psql_test < "$migration" >/dev/null || fail "cadeia: falhou ao aplicar $name"
done
pass '(0) cadeia completa das migrations Talk X aplicada do zero (15 migrations, ordem de versao)'

# Sanidade da cadeia: as duas funcoes vivem com a assinatura esperada.
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='save_talkx_campaign_draft'")" == '1' ]] \
  || fail 'cadeia: save_talkx_campaign_draft deveria existir uma unica vez'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='transition_talkx_campaign'")" == '1' ]] \
  || fail 'cadeia: transition_talkx_campaign deveria ter uma unica assinatura viva (4 args)'
[[ "$(psql_q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name IN ('template_version_id','launched_by','launched_at')")" == '3' ]] \
  || fail 'cadeia: colunas template_version_id/launched_by/launched_at deveriam existir'
pass '(0) cadeia deixa 1 assinatura por funcao e as 3 colunas-alvo'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"

draft_payload() { # $1 = template_version_id ('' para omitir)
  if [[ -n "$1" ]]; then
    printf '{"name":"Rascunho audit","message_template":"Ola","objective":"vendas","audience_source":"contacts","audience_filters":{},"draft_step":2,"template_version_id":"%s"}' "$1"
  else
    printf '{"name":"Rascunho audit","message_template":"Ola","objective":"vendas","audience_source":"contacts","audience_filters":{},"draft_step":2}'
  fi
}

# ---------------------------------------------------------------------------
# (RED A) a cadeia viva IGNORA template_version_id: a coluna fica NULL.
# ---------------------------------------------------------------------------
key_red='90000000-0000-0000-0000-0000000000a1'
red_id="$(psql_q "$admin_session SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, '$key_red'::uuid, '$(draft_payload "$version_1")'::jsonb);")"
[[ -n "$red_id" ]] || fail '(RED A) create com template_version_id falhou na cadeia viva'
red_ver="$(psql_q "SELECT COALESCE(template_version_id::text, 'NULL') FROM public.talkx_campaigns WHERE id='$red_id'")"
[[ "$red_ver" == 'NULL' ]] || fail "(RED A) regressao ausente: template_version_id deveria ser ignorado pela cadeia viva [obtido: $red_ver]"
pass '(RED A) cadeia viva reproduz a regressao: save_talkx_campaign_draft ignora template_version_id (coluna NULL)'

# ---------------------------------------------------------------------------
# (RED B) a cadeia viva deixa launched_by/launched_at NULL no start.
# ---------------------------------------------------------------------------
camp_red='40000000-0000-0000-0000-0000000000b1'
psql_test -q >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, message_template, status, total_recipients, created_by)
VALUES ('$camp_red', 'Campanha RED B', 'Ola', 'draft', 1, '$admin_profile');
INSERT INTO public.talkx_recipients (campaign_id, contact_id) VALUES ('$camp_red', '$creator_contact');
SQL
psql_q "$service_session SELECT * FROM public.transition_talkx_campaign('$camp_red', 'start', NULL, '$actor_profile')" >/dev/null
red_launched="$(psql_q "SELECT COALESCE(launched_by::text,'NULL') || '|' || COALESCE(launched_at::text,'NULL') FROM public.talkx_campaigns WHERE id='$camp_red'")"
[[ "$red_launched" == 'NULL|NULL' ]] || fail "(RED B) regressao ausente: start deveria deixar launched_by/launched_at NULL [obtido: $red_launched]"
pass '(RED B) cadeia viva reproduz a regressao: start nao grava launched_by/launched_at (NULL|NULL)'

# ---------------------------------------------------------------------------
# (1) aplica a migration de correcao (e prova que e idempotente).
# ---------------------------------------------------------------------------
[[ -f "$fix_migration" ]] || fail "migration de correcao ausente: $fix_migration"
psql_test < "$fix_migration" >/dev/null || fail 'migration de correcao nao aplicou'
psql_test < "$fix_migration" >/dev/null || fail 'migration de correcao nao e idempotente (2a aplicacao falhou)'
pass '(1) migration de correcao aplica e e replayavel'

# ---------------------------------------------------------------------------
# (GREEN A1) INSERT grava template_version_id (versao 2).
# ---------------------------------------------------------------------------
key_a1='90000000-0000-0000-0000-0000000000a2'
out="$(psql_q "$admin_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '$key_a1'::uuid, '$(draft_payload "$version_2")'::jsonb);")"
[[ "$out" == *':1:false' ]] || fail "(GREEN A1) create deveria devolver revisao 1 e replayed=false [obtido: $out]"
camp_a="$(printf '%s' "$out" | cut -d: -f1)"
ver_a="$(psql_q "SELECT template_version_id FROM public.talkx_campaigns WHERE id='$camp_a'")"
[[ "$ver_a" == "$version_2" ]] || fail "(GREEN A1) INSERT deveria gravar template_version_id=$version_2 [obtido: $ver_a]"
pass '(GREEN A1) save_talkx_campaign_draft grava template_version_id no INSERT'

# ---------------------------------------------------------------------------
# (GREEN A2) UPDATE grava a nova versao (v1) e avanca a revisao.
# ---------------------------------------------------------------------------
out2="$(psql_q "$admin_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft('$camp_a'::uuid, 1, '$key_a1'::uuid, '$(draft_payload "$version_1")'::jsonb);")"
[[ "$out2" == "$camp_a:2:false" ]] || fail "(GREEN A2) update deveria devolver revisao 2 [obtido: $out2]"
ver_a2="$(psql_q "SELECT template_version_id FROM public.talkx_campaigns WHERE id='$camp_a'")"
[[ "$ver_a2" == "$version_1" ]] || fail "(GREEN A2) UPDATE deveria gravar template_version_id=$version_1 [obtido: $ver_a2]"
pass '(GREEN A2) save_talkx_campaign_draft grava template_version_id no UPDATE'

# ---------------------------------------------------------------------------
# (GREEN A3) idempotencia: replay identico nao recalcula; trocar SOMENTE a versao conflita.
# ---------------------------------------------------------------------------
replay="$(psql_q "$admin_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '$key_a1'::uuid, '$(draft_payload "$version_1")'::jsonb);")"
[[ "$replay" == "$camp_a:2:true" ]] || fail "(GREEN A3) replay identico deveria ser replayed=true na revisao 2 [obtido: $replay]"
conflict="$(psql_test -v VERBOSITY=verbose -c "$admin_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '$key_a1'::uuid, '$(draft_payload "$version_2")'::jsonb);" 2>&1 || true)"
[[ "$conflict" == *talkx_draft_creation_key_payload_conflict* ]] || fail "(GREEN A3) trocar SOMENTE template_version_id deveria conflitar [obtido: $conflict]"
pass '(GREEN A3) template_version_id entra na idempotencia da criacao (replay identico ok; so a versao -> conflito)'

# ---------------------------------------------------------------------------
# (GREEN B1) start grava launched_by = p_actor_id e launched_at.
# ---------------------------------------------------------------------------
camp_b='40000000-0000-0000-0000-0000000000b2'
psql_test -q >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, message_template, status, total_recipients, created_by)
VALUES ('$camp_b', 'Campanha GREEN B', 'Ola', 'draft', 1, '$admin_profile');
INSERT INTO public.talkx_recipients (campaign_id, contact_id) VALUES ('$camp_b', '$creator_contact');
SQL
psql_q "$service_session SELECT * FROM public.transition_talkx_campaign('$camp_b', 'start', NULL, '$actor_profile')" >/dev/null
launched="$(psql_q "SELECT COALESCE(launched_by::text,'NULL') || '|' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='$camp_b'")"
[[ "$launched" == "$actor_profile|true" ]] || fail "(GREEN B1) start deveria gravar launched_by=$actor_profile e launched_at preenchido [obtido: $launched]"
pass '(GREEN B1) transition_talkx_campaign grava launched_by = p_actor_id e launched_at no start'

# ---------------------------------------------------------------------------
# (GREEN B2) retomada idempotente (sending -> sending) preserva launched_by/at.
# ---------------------------------------------------------------------------
psql_q "$service_session SELECT * FROM public.transition_talkx_campaign('$camp_b', 'start', NULL, '$admin_profile')" >/dev/null
launched2="$(psql_q "SELECT COALESCE(launched_by::text,'NULL') || '|' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='$camp_b'")"
[[ "$launched2" == "$actor_profile|true" ]] || fail "(GREEN B2) replay do start deveria PRESERVAR launched_by (COALESCE) [obtido: $launched2]"
pass '(GREEN B2) replay idempotente do start preserva launched_by/launched_at'

# ---------------------------------------------------------------------------
# (GREEN B3) pause/cancel nao tocam launched_by/launched_at (ELSE preserva).
# ---------------------------------------------------------------------------
psql_q "$service_session SELECT * FROM public.transition_talkx_campaign('$camp_b', 'pause', 'caí', '$admin_profile')" >/dev/null
launched3="$(psql_q "SELECT COALESCE(launched_by::text,'NULL') || '|' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='$camp_b'")"
[[ "$launched3" == "$actor_profile|true" ]] || fail "(GREEN B3) pause nao deveria alterar launched_by/launched_at [obtido: $launched3]"
pass '(GREEN B3) pause preserva launched_by/launched_at'

printf 'PASS: Talk X regressoes — cadeia viva reproduz as 2 perdas e a correcao 20261002431230 restaura template_version_id (save) e launched_by/launched_at (start)\n'
