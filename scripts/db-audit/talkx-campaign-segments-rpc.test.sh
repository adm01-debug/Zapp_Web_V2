#!/usr/bin/env bash
# X057b (Fase 6 · banco): COMPORTAMENTO de "varios segmentos por campanha".
#
# ESCOPO — o que este harness prova (contrato real, PostgreSQL 17 descartavel):
#   (a) save_talkx_campaign_draft le `segment_ids` do payload: a lista vira as linhas
#       ORDENADAS de talkx_campaign_segments (position 1..n) e talkx_campaigns.segment_id
#       fica com o PRIMEIRO (compatibilidade);
#   (b) 11 segmentos -> 22023 (teto de 10 do aceite do plano);
#   (c) snapshot_talkx_campaign_audience resolve os segmentos NA ORDEM de position e
#       grava em cada destinatario o PRIMEIRO segmento que o contem: 3 segmentos com
#       10, 8 e 5 contatos e 4 repetidos -> 19 destinatarios distintos (10+8+5-4);
#   (d) campanha de segmento unico/legado (sem linhas na tabela nova) continua resolvendo
#       pela coluna talkx_campaigns.segment_id;
#   (e) ACL: authenticated NAO executa o helper talkx_sync_campaign_segments (service_role).
#
# Aplica as migrations REAIS na ordem de versao — X016 (talkx_audience_query),
# X017 (snapshot), X057a (estrutura) e X057b (esta entrega) — sobre um schema minimo
# com os objetos que os RPCs tocam, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-audience-snapshot.test.sh, talkx-campaign-segments.test.sh).
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em CASES_SEEN e o
# harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_x016="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
migration_x017="$repo_root/supabase/migrations/20261002421230_talkx_audience_snapshot.sql"
migration_x057a="$repo_root/supabase/migrations/20261002641230_talkx_v4_x057_segmentos.sql"
migration_x057b="${TALKX_X057B_MIGRATION:-$repo_root/supabase/migrations/20261009032420_x057b_rpc_segmentos.sql}"
postgres_image="${TALKX_CAMPAIGN_SEGMENTS_RPC_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-segments-rpc-test-$$"
test_password="talkx_campaign_segments_rpc_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  save_writes_ordered_segments save_rejects_eleven
  snapshot_dedupes_across_segments snapshot_first_segment_wins
  legacy_single_segment helper_acl
)
case_done() { CASES_SEEN["$1"]=1; }

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
    # wal_level=logical: a X057a faz ALTER PUBLICATION ADD TABLE (Realtime).
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" \
         "$postgres_image" postgres -c wal_level=logical >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for m in "$migration_x016" "$migration_x017" "$migration_x057a" "$migration_x057b"; do
  [[ -f "$m" ]] || fail "migration ausente: $m"
done

start_postgres || fail 'PostgreSQL de teste nao iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'

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
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value text NOT NULL);

-- X018 (20261002551230) e uma RPC grande; aqui basta o contrato do ritmo.
CREATE FUNCTION public.talkx_resolve_speed_pace(
  p_speed_profile text,
  p_send_interval_min integer,
  p_send_interval_max integer,
  p_typing_delay_min integer,
  p_typing_delay_max integer
)
RETURNS TABLE(
  speed_profile text,
  send_interval_min integer,
  send_interval_max integer,
  typing_delay_min integer,
  typing_delay_max integer
)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_speed_profile, 'moderate'),
         COALESCE(p_send_interval_min, 8000),
         COALESCE(p_send_interval_max, 20000),
         COALESCE(p_typing_delay_min, 1500),
         COALESCE(p_typing_delay_max, 4000)
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
  template_version_id uuid,
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
  max_per_minute smallint,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  legal_basis text,
  consent_confirmed_by uuid,
  consent_confirmed_at timestamptz,
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
  audience_snapshot_at timestamptz,
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
-- talkx_recipients SEM segment_id: a X057a e quem adiciona a coluna.
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (campaign_id, contact_id)
);
CREATE PUBLICATION supabase_realtime FOR TABLE public.talkx_recipients;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, service_role;
GRANT SELECT ON public.talkx_segments TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Migrations REAIS, na ordem de versao.
# ---------------------------------------------------------------------------
psql_test < "$migration_x016" >/dev/null || fail 'X016 nao aplicou'
psql_test < "$migration_x017" >/dev/null || fail 'X017 nao aplicou'
psql_test < "$migration_x057a" >/dev/null || fail 'X057a nao aplicou'
psql_test < "$migration_x057b" >/dev/null || fail 'X057b nao aplicou'
pass '(0) X016, X017, X057a e X057b aplicadas sobre o schema minimo'

# ---------------------------------------------------------------------------
# Fixture: 19 contatos distintos; 3 segmentos com 10, 8 e 5 contatos e 4 repetidos
# (K∩R=2, K∩M=1, R∩M=1). O discriminador e a coluna `tags` (operador contains).
# ---------------------------------------------------------------------------
seg_k='40000000-0000-0000-0000-0000000000a1'
seg_r='40000000-0000-0000-0000-0000000000a2'
seg_m='40000000-0000-0000-0000-0000000000a3'
c_k_first='30000000-0000-0000-0000-000000000016'   # K∩R -> primeiro segmento = K
c_km='30000000-0000-0000-0000-000000000018'        # K∩M -> primeiro segmento = K
c_rm='30000000-0000-0000-0000-000000000019'        # R∩M -> primeiro segmento = R
c_r_first='30000000-0000-0000-0000-000000000008'   # so R

psql_test >/dev/null <<SQL
INSERT INTO public.contacts (id, name, phone, tags, visible) VALUES
  ('30000000-0000-0000-0000-000000000001', 'C01', '5511900000001', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000002', 'C02', '5511900000002', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000003', 'C03', '5511900000003', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000004', 'C04', '5511900000004', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000005', 'C05', '5511900000005', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000006', 'C06', '5511900000006', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000007', 'C07', '5511900000007', ARRAY['K'], true),
  ('30000000-0000-0000-0000-000000000008', 'C08', '5511900000008', ARRAY['R'], true),
  ('30000000-0000-0000-0000-000000000009', 'C09', '5511900000009', ARRAY['R'], true),
  ('30000000-0000-0000-0000-000000000010', 'C10', '5511900000010', ARRAY['R'], true),
  ('30000000-0000-0000-0000-000000000011', 'C11', '5511900000011', ARRAY['R'], true),
  ('30000000-0000-0000-0000-000000000012', 'C12', '5511900000012', ARRAY['R'], true),
  ('30000000-0000-0000-0000-000000000013', 'C13', '5511900000013', ARRAY['M'], true),
  ('30000000-0000-0000-0000-000000000014', 'C14', '5511900000014', ARRAY['M'], true),
  ('30000000-0000-0000-0000-000000000015', 'C15', '5511900000015', ARRAY['M'], true),
  ('30000000-0000-0000-0000-000000000016', 'C16', '5511900000016', ARRAY['K','R'], true),
  ('30000000-0000-0000-0000-000000000017', 'C17', '5511900000017', ARRAY['K','R'], true),
  ('30000000-0000-0000-0000-000000000018', 'C18', '5511900000018', ARRAY['K','M'], true),
  ('30000000-0000-0000-0000-000000000019', 'C19', '5511900000019', ARRAY['R','M'], true);

INSERT INTO public.talkx_segments (id, name, rules, status) VALUES
  ('$seg_k', 'K', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"K"}]}]}'::jsonb, 'active'),
  ('$seg_r', 'R', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"R"}]}]}'::jsonb, 'active'),
  ('$seg_m', 'M', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"M"}]}]}'::jsonb, 'active');

-- 11 segmentos ativos para o teto do aceite (rules sem ninguem; so o numero importa).
INSERT INTO public.talkx_segments (id, name, rules, status)
SELECT ('40000000-0000-0000-0000-0000000000b' || to_hex(n))::uuid,
       'T' || n, '{"groups":[]}'::jsonb, 'active'
  FROM generate_series(1, 9) AS n;
INSERT INTO public.talkx_segments (id, name, rules, status) VALUES
  ('40000000-0000-0000-0000-0000000000c1', 'T10', '{"groups":[]}'::jsonb, 'active'),
  ('40000000-0000-0000-0000-0000000000c2', 'T11', '{"groups":[]}'::jsonb, 'active');
SQL

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"

# ---------------------------------------------------------------------------
# (a) save_talkx_campaign_draft grava a lista ORDENADA em talkx_campaign_segments
#     e mantem talkx_campaigns.segment_id = PRIMEIRO.
# ---------------------------------------------------------------------------
creation_key='90000000-0000-0000-0000-000000000001'
payload='{"name":"Multi","message_template":"Ola","objective":"vendas","audience_source":"segment","audience_filters":{},"segment_ids":["'"$seg_k"'","'"$seg_r"'","'"$seg_m"'"]}'
save_out="$(psql_q "$admin_session SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key'::uuid, '$payload'::jsonb);")"
campaign_multi="$save_out"
[[ -n "$campaign_multi" ]] || fail '(a) save_talkx_campaign_draft nao devolveu campaign_id'

seg_rows="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$campaign_multi'")"
[[ "$seg_rows" == '3' ]] || fail "(a) talkx_campaign_segments deveria ter 3 linhas [obtido: $seg_rows]"

seg_order="$(psql_q "SELECT string_agg(segment_id::text, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$campaign_multi'")"
[[ "$seg_order" == "$seg_k,$seg_r,$seg_m" ]] || fail "(a) ordem das linhas nao bate com o payload [obtido: $seg_order]"

seg_positions="$(psql_q "SELECT string_agg(position::text, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$campaign_multi'")"
[[ "$seg_positions" == '1,2,3' ]] || fail "(a) positions deveriam ser 1,2,3 [obtido: $seg_positions]"

seg_first="$(psql_q "SELECT segment_id FROM public.talkx_campaigns WHERE id='$campaign_multi'")"
[[ "$seg_first" == "$seg_k" ]] || fail "(a) talkx_campaigns.segment_id deveria ser o PRIMEIRO [obtido: $seg_first]"
pass '(a) segment_ids -> 3 linhas ordenadas (position 1,2,3) e segment_id = primeiro'
case_done save_writes_ordered_segments

# ---------------------------------------------------------------------------
# (b) 11 segmentos -> 22023 (teto do aceite).
# ---------------------------------------------------------------------------
eleven="$(psql_q "SELECT (jsonb_agg(id ORDER BY name))::text FROM public.talkx_segments WHERE name LIKE 'T%'")"
[[ "$(psql_q "SELECT count(*) FROM public.talkx_segments WHERE name LIKE 'T%'")" == '11' ]] \
  || fail '(b) fixture de 11 segmentos incompleta'
[[ "$eleven" == '['*']' ]] || fail "(b) lista de 11 segmentos nao foi montada [obtido: $eleven]"
payload11='{"name":"Onze","message_template":"Ola","objective":"vendas","audience_source":"segment","audience_filters":{},"segment_ids":'"$eleven"'}'
expect_error '(b) 11 segmentos -> 22023' 'invalid_talkx_campaign_draft' '22023' \
  "$admin_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '90000000-0000-0000-0000-000000000002'::uuid, '$payload11'::jsonb);"
case_done save_rejects_eleven

# ---------------------------------------------------------------------------
# (c) snapshot resolve os 3 segmentos e DEDUPLICA: 10+8+5-4 = 19 destinatarios.
# ---------------------------------------------------------------------------
snap_eligible="$(psql_q "$admin_session SELECT (public.snapshot_talkx_campaign_audience('$campaign_multi', 1) ->> 'eligible')::bigint;")"
[[ "$snap_eligible" == '19' ]] || fail "(c) eligible deveria ser 19 [obtido: $snap_eligible]"

total_rows="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi'")"
[[ "$total_rows" == '19' ]] || fail "(c) talkx_recipients deveria ter 19 linhas [obtido: $total_rows]"

distintos="$(psql_q "SELECT count(DISTINCT contact_id) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi'")"
[[ "$distintos" == '19' ]] || fail "(c) contatos distintos deveriam ser 19 [obtido: $distintos]"

total_camp="$(psql_q "SELECT total_recipients FROM public.talkx_campaigns WHERE id='$campaign_multi'")"
[[ "$total_camp" == '19' ]] || fail "(c) total_recipients deveria ser 19 [obtido: $total_camp]"
pass '(c) 3 segmentos (10+8+5, 4 repetidos) -> 19 destinatarios distintos, sem duplicar contato'
case_done snapshot_dedupes_across_segments

# por segmento: K=10 (7 so-K + 2 K∩R + 1 K∩M), R=6 (5 so-R + 1 R∩M), M=3 (so-M).
k_count="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi' AND segment_id='$seg_k'")"
r_count="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi' AND segment_id='$seg_r'")"
m_count="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi' AND segment_id='$seg_m'")"
[[ "$k_count" == '10' ]] || fail "(c) segmento K deveria ficar com 10 destinatarios [obtido: $k_count]"
[[ "$r_count" == '6' ]] || fail "(c) segmento R deveria ficar com 6 destinatarios [obtido: $r_count]"
[[ "$m_count" == '3' ]] || fail "(c) segmento M deveria ficar com 3 destinatarios [obtido: $m_count]"

sem_seg="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_multi' AND segment_id IS NULL")"
[[ "$sem_seg" == '0' ]] || fail "(c) nenhum destinatario de segmento pode ficar sem segment_id [obtido: $sem_seg]"

# o PRIMEIRO segmento que contem o contato vence (K antes de R; R antes de M).
for pair in "$c_k_first:$seg_k" "$c_km:$seg_k" "$c_rm:$seg_r" "$c_r_first:$seg_r"; do
  cid="${pair%%:*}"; want="${pair##*:}"
  got="$(psql_q "SELECT segment_id FROM public.talkx_recipients WHERE campaign_id='$campaign_multi' AND contact_id='$cid'")"
  [[ "$got" == "$want" ]] || fail "(c) contato $cid deveria ficar no primeiro segmento $want [obtido: $got]"
done
pass '(c) cada destinatario fica com o PRIMEIRO segmento (position) que o contem: K=10, R=6, M=3'
case_done snapshot_first_segment_wins

# ---------------------------------------------------------------------------
# (d) segmento unico/legado: campanha so com a coluna segment_id resolve por ela.
# ---------------------------------------------------------------------------
legacy_campaign='50000000-0000-0000-0000-0000000000f1'
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns
  (id, name, message_template, objective, audience_source, audience_filters, segment_id,
   created_by, status, revision)
VALUES
  ('$legacy_campaign', 'Legado', 'Ola', 'vendas', 'segment', '{}'::jsonb,
   '$seg_k', '10000000-0000-0000-0000-000000000001', 'draft', 1);
SQL
legacy_snap="$(psql_q "$admin_session SELECT (public.snapshot_talkx_campaign_audience('$legacy_campaign', 1) ->> 'eligible')::bigint;")"
[[ "$legacy_snap" == '10' ]] || fail "(d) legado (segment_id unico) deveria dar 10 [obtido: $legacy_snap]"
legacy_null="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$legacy_campaign' AND segment_id IS DISTINCT FROM '$seg_k'::uuid")"
[[ "$legacy_null" == '0' ]] || fail "(d) legado deveria gravar segment_id em todas as linhas [divergentes: $legacy_null]"
pass '(d) campanha de segmento unico/legado continua resolvendo por talkx_campaigns.segment_id'
case_done legacy_single_segment

# ---------------------------------------------------------------------------
# (e) ACL: o helper nao e acessivel ao authenticated; so ao service_role.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_sync_campaign_segments(uuid,uuid[])', 'EXECUTE')")" == 'f' ]] \
  || fail '(e) authenticated NAO pode executar talkx_sync_campaign_segments'
[[ "$(psql_q "SELECT has_function_privilege('service_role', 'public.talkx_sync_campaign_segments(uuid,uuid[])', 'EXECUTE')")" == 't' ]] \
  || fail '(e) service_role deveria executar talkx_sync_campaign_segments'
[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.snapshot_talkx_campaign_audience(uuid,bigint)', 'EXECUTE')")" == 'f' ]] \
  || fail '(e) anon NAO pode executar snapshot_talkx_campaign_audience'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.snapshot_talkx_campaign_audience(uuid,bigint)', 'EXECUTE')")" == 't' ]] \
  || fail '(e) authenticated deveria executar snapshot_talkx_campaign_audience'
pass '(e) ACL: helper so para service_role; snapshot negado ao anon'
case_done helper_acl

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: X057b comportamento — segment_ids ordenados no rascunho, teto de 10 (22023), snapshot com dedupe (19 destinatarios) e primeiro segmento por contato\n'
