#!/usr/bin/env bash
# X017 (Fase 2 · Tela 06/08/09/10 · banco + front/hook): gerar os destinatarios no
# servidor a partir do rascunho salvo. Fecha CAP-004, CAP-028, CAP-030, CAP-103.
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-role-gates.test.sh, scripts/db-audit/talkx-audience-rpc.test.sh).
#
# Aplica a X016 REAL (20261002391230, talkx_audience_query) e a X017 REAL
# (20261002421230) sobre um schema minimo com as colunas/objetos que os RPCs
# tocam, e prova:
#   (a) migration aplica e e replayavel; colunas respect_suppression/audience_snapshot_at;
#   (b) snapshot_talkx_campaign_audience de um rascunho de SEGMENTO com 6 elegiveis
#       e 2 suprimidos (mais 1 excluido) -> {eligible:6, suppressed:2, skipped_invalid:1},
#       6 linhas em talkx_recipients e total_recipients=6; os ids batem com os elegiveis;
#   (c) revisao antiga (p_expected_revision desatualizado) -> conflito 40001;
#   (d) respect_suppression=false em save_talkx_campaign_draft -> 22023;
#   (e) agente (authenticated sem papel) -> 42501; anon sem EXECUTE.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration_x016="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
migration_x017="$repo_root/supabase/migrations/20261002421230_talkx_audience_snapshot.sql"
postgres_image="${TALKX_AUDIENCE_SNAPSHOT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-audience-snapshot-test-$$"
test_password="talkx_audience_snapshot_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# Espera a mensagem de contrato E o SQLSTATE (psql -v VERBOSITY=verbose imprime
# "ERROR:  <codigo>: <mensagem>").
expect_error() {
  local label="$1" message="$2" errcode="$3" sql="$4" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  [[ "$out" == *"$errcode"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o SQLSTATE '$errcode'"; }
  pass "$label"
}

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
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'
supervisor_uid='20000000-0000-0000-0000-000000000002'
agent_uid='20000000-0000-0000-0000-000000000003'
admin_profile='10000000-0000-0000-0000-000000000001'
seg_acme='40000000-0000-0000-0000-0000000000c1'
campaign_segment='50000000-0000-0000-0000-000000000001'
campaign_save='50000000-0000-0000-0000-000000000002'

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
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint NOT NULL DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  worker_id text,
  worker_lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_created_by_draft_key
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  nickname text,
  phone text NOT NULL,
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
  SELECT _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.contacts c
       WHERE c.id = _contact_id
         AND (public.is_admin_or_supervisor(_user_id) OR c.visible)
     )
$$;

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  origin text NOT NULL DEFAULT 'manual',
  expires_at timestamptz,
  removed_at timestamptz
);
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (campaign_id, contact_id)
);

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

-- Fixture do segmento (company = 'Acme'): 6 elegiveis (c01..c06), 2 suprimidos
-- por contact_id (c07, c08) e 1 excluido (c09 -> skipped_invalid).
INSERT INTO public.contacts
  (id, name, phone, company, city, state, is_lid_legacy, deleted_at, visible) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Ana',   '5511900000001', 'Acme', 'Sao Paulo', 'SP', false, NULL, true),
  ('30000000-0000-0000-0000-000000000002', 'Bruno', '5511900000002', 'Acme', 'Rio',       'RJ', false, NULL, true),
  ('30000000-0000-0000-0000-000000000003', 'Carla', '5511900000003', 'Acme', 'Sao Paulo', 'SP', false, NULL, true),
  ('30000000-0000-0000-0000-000000000004', 'Duda',  '5511900000004', 'Acme', 'Curitiba',  'PR', false, NULL, true),
  ('30000000-0000-0000-0000-000000000005', 'Edu',   '5511900000005', 'Acme', 'Salvador',  'BA', false, NULL, true),
  ('30000000-0000-0000-0000-000000000006', 'Fabio', '5511900000006', 'Acme', 'Recife',    'PE', false, NULL, true),
  ('30000000-0000-0000-0000-000000000007', 'Gil',   '5511900000007', 'Acme', 'Sao Paulo', 'SP', false, NULL, true),
  ('30000000-0000-0000-0000-000000000008', 'Hugo',  '5511900000008', 'Acme', 'Rio',       'RJ', false, NULL, true),
  ('30000000-0000-0000-0000-000000000009', 'Ivo',   '5511900000009', 'Acme', 'Sao Paulo', 'SP', false, statement_timestamp() - interval '2 days', true);

-- Suprimidos ativos (por contact_id).
INSERT INTO public.talkx_blacklist (contact_id, reason, origin) VALUES
  ('30000000-0000-0000-0000-000000000007', 'opt-out', 'optout'),
  ('30000000-0000-0000-0000-000000000008', 'opt-out', 'optout');

INSERT INTO public.talkx_segments (id, name, rules, created_by) VALUES
  ('40000000-0000-0000-0000-0000000000c1', 'Acme',
   '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Acme"}]}]}'::jsonb,
   '10000000-0000-0000-0000-000000000001');

-- Rascunho de SEGMENTO na revisao 1 (origem lida do proprio rascunho).
INSERT INTO public.talkx_campaigns
  (id, name, message_template, objective, audience_source, audience_filters, segment_id,
   created_by, status, revision) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Segmento Acme', 'Olá', 'vendas', 'segment', '{}'::jsonb,
   '40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'draft', 1),
  ('50000000-0000-0000-0000-000000000002', 'Save', 'Olá', 'vendas', 'contacts', '{}'::jsonb,
   NULL, '10000000-0000-0000-0000-000000000001', 'draft', 1);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, service_role;
GRANT SELECT ON public.talkx_segments TO authenticated, service_role;
SQL

[[ -f "$migration_x016" ]] || fail "migration ausente: $migration_x016"
[[ -f "$migration_x017" ]] || fail "migration ausente: $migration_x017"
psql_test < "$migration_x016" >/dev/null
psql_test < "$migration_x017" >/dev/null
# Replayavel: uma segunda aplicacao nao pode falhar.
psql_test < "$migration_x017" >/dev/null
pass '(a) migration X017 aplica sobre a X016 e e replayavel'

[[ "$(psql_q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name IN ('respect_suppression','audience_snapshot_at')")" == '2' ]] \
  || fail '(a) colunas respect_suppression/audience_snapshot_at ausentes'
pass '(a) colunas respect_suppression e audience_snapshot_at presentes'

# ---------------------------------------------------------------------------
# ACL: anon sem EXECUTE na RPC; authenticated com EXECUTE.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.snapshot_talkx_campaign_audience(uuid,bigint)', 'EXECUTE')")" == 'f' ]] \
  || fail 'anon com EXECUTE em snapshot_talkx_campaign_audience'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.snapshot_talkx_campaign_audience(uuid,bigint)', 'EXECUTE')")" == 't' ]] \
  || fail 'authenticated sem EXECUTE em snapshot_talkx_campaign_audience'
pass '(a) ACL: anon sem EXECUTE e authenticated com EXECUTE na RPC de snapshot'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$supervisor_uid';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$agent_uid';"

# ---------------------------------------------------------------------------
# (b) snapshot do rascunho de segmento: 6 elegiveis, 2 suprimidos, 1 excluido.
# ---------------------------------------------------------------------------
snapshot_json="$(psql_q "$admin_session SELECT public.snapshot_talkx_campaign_audience('$campaign_segment', 1);")"
for pair in 'eligible=6' 'suppressed=2' 'skipped_invalid=1'; do
  key="${pair%%=*}"; want="${pair##*=}"
  got="$(psql_q "$admin_session SELECT (public.snapshot_talkx_campaign_audience('$campaign_segment', 1) ->> '$key')::bigint;")"
  [[ "$got" == "$want" ]] || fail "(b) snapshot.$key deveria ser $want [obtido: $got | $snapshot_json]"
done
rows="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_segment'")"
[[ "$rows" == '6' ]] || fail "(b) talkx_recipients deveria ter 6 linhas [obtido: $rows]"
total="$(psql_q "SELECT total_recipients FROM public.talkx_campaigns WHERE id='$campaign_segment'")"
[[ "$total" == '6' ]] || fail "(b) total_recipients deveria ser 6 [obtido: $total]"
snapshot_at="$(psql_q "SELECT audience_snapshot_at IS NOT NULL FROM public.talkx_campaigns WHERE id='$campaign_segment'")"
[[ "$snapshot_at" == 't' ]] || fail '(b) audience_snapshot_at nao foi gravado'
ids="$(psql_q "SELECT string_agg(contact_id::text, ',' ORDER BY contact_id) FROM public.talkx_recipients WHERE campaign_id='$campaign_segment'")"
expected_ids='30000000-0000-0000-0000-000000000001,30000000-0000-0000-0000-000000000002,30000000-0000-0000-0000-000000000003,30000000-0000-0000-0000-000000000004,30000000-0000-0000-0000-000000000005,30000000-0000-0000-0000-000000000006'
[[ "$ids" == "$expected_ids" ]] || fail "(b) destinatarios inesperados [obtido: $ids]"
pass '(b) segmento com 6 elegiveis e 2 suprimidos (+1 excluido) -> 6 linhas e total_recipients=6'

# supervisor tambem gera o snapshot (segunda execucao substitui, sem duplicar).
supervisor_eligible="$(psql_q "$supervisor_session SELECT public.snapshot_talkx_campaign_audience('$campaign_segment', 1) ->> 'eligible';")"
[[ "$supervisor_eligible" == '6' ]] || fail "(b) supervisor: eligible deveria ser 6 [obtido: $supervisor_eligible]"
[[ "$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_segment'")" == '6' ]] \
  || fail '(b) snapshot repetido duplicou destinatarios'
pass '(b) supervisor tambem gera o snapshot; reexecucao nao duplica destinatarios'

# ---------------------------------------------------------------------------
# (c) revisao antiga -> conflito 40001.
# ---------------------------------------------------------------------------
expect_error '(c) revisao antiga -> 40001' 'talkx_campaign_stale_revision' '40001' \
  "$admin_session SELECT public.snapshot_talkx_campaign_audience('$campaign_segment', 99);"

# ---------------------------------------------------------------------------
# (d) respect_suppression=false -> 22023.
# ---------------------------------------------------------------------------
expect_error '(d) respect_suppression=false -> 22023' 'talkx_respect_suppression_false_nao_liberado' '22023' \
  "$admin_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '90000000-0000-0000-0000-000000000001'::uuid, '{\"name\":\"Campanha\",\"message_template\":\"Ola\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"audience_filters\":{},\"respect_suppression\":false}'::jsonb);"

# ---------------------------------------------------------------------------
# (e) agente (authenticated sem papel) -> 42501.
# ---------------------------------------------------------------------------
expect_error '(e) agente -> 42501' 'talkx_campaign_role_required' '42501' \
  "$agent_session SELECT public.snapshot_talkx_campaign_audience('$campaign_segment', 1);"

printf 'PASS: X017 audience snapshot — snapshot do rascunho, elegibilidade, revisao otimista, flag de supressao e gate de papel\n'
