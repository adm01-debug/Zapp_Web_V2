#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — X027.
# Fecha CAP-016, CAP-017, CAP-018, CAP-019, CAP-020, CAP-099, CAP-110.
#
# Prova, em PostgreSQL 17, o delta de X027:
#   RED (antes da migration):
#     - talkx_campaigns.read_count NÃO existe (a V17 escreve nele mas nunca o criou);
#     - record_talkx_recipient_receipt / attribute_talkx_reply /
#       talkx_campaign_reply_stats NÃO existem.
#   GREEN (depois):
#     - record_talkx_recipient_receipt 'read' SEM delivered anterior preenche
#       delivered_at E read_at, delivered_count=1, read_count=1;
#     - repetir o evento → contadores iguais (idempotente);
#     - record_talkx_recipient_delivered continua sendo invólucro da RPC canônica;
#     - resposta vinda do MESMO telefone com OUTRO contact_id é atribuída (eixo telefone);
#     - setting reply_window_hours=48 → resposta com 60h NÃO atribui; 72 → atribui;
#     - fixture com respostas em 120s e 202s → avg_reply_seconds=161 (mediana também);
#     - pg_publication_tables lista read_at;
#     - anon não executa as RPCs de recibo/resposta.
#
# A migration é encontrada pelo marcador interno 'talkx_x027_objetos_ausentes'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/x027.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_x027_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/x027.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration X027 nao encontrada (marcador talkx_x027_objetos_ausentes)\n' >&2; exit 1; }

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x027-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-x027-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# psql estrito (setup/migration): qualquer erro aborta.
psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
# psql permissivo (assert em query única): devolve stdout+stderr; nunca derruba o harness.
psql_raw() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
# Query feliz: deve imprimir exatamente o esperado.
psql_val() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
# Multi-statement em transação (SET LOCAL valendo para os passos seguintes); erros viram texto.
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}
assert_not_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" != *"$pattern"* ]] || fail "$label: NÃO deveria conter '$pattern' -> $actual"
  pass "$label (sem '$pattern')"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_RECEIPTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x027_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores ───────────────────────────────────────────────────────────
conn_1='30000000-0000-0000-0000-0000000000c1'
conn_2='30000000-0000-0000-0000-0000000000c2'
c_receipt='20000000-0000-0000-0000-0000000000a1'
c_wrap='20000000-0000-0000-0000-0000000000a2'
c_phone='20000000-0000-0000-0000-0000000000a3'
c_win='20000000-0000-0000-0000-0000000000a4'
c_stats='20000000-0000-0000-0000-0000000000a5'
r_receipt='21000000-0000-0000-0000-0000000000a1'
r_wrap='21000000-0000-0000-0000-0000000000a2'
r_phone='21000000-0000-0000-0000-0000000000a3'
r_win='21000000-0000-0000-0000-0000000000a4'
r_s1='21000000-0000-0000-0000-0000000000a5'
r_s2='21000000-0000-0000-0000-0000000000a6'
contact_phone='50000000-0000-0000-0000-0000000000b1'
contact_win='50000000-0000-0000-0000-0000000000b2'
contact_other='50000000-0000-0000-0000-0000000000bf'   # OUTRO contact_id (não é dono de nenhum destinatário)
msg_1='90000000-0000-0000-0000-000000000001'

# ── fixtures mínimos (o suficiente para o delta de X027 rodar) ────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text);

-- messages(id) é alvo da FK talkx_recipients.reply_message_id.
CREATE TABLE public.messages (id uuid PRIMARY KEY);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings (key, value, description)
  VALUES ('reply_window_hours', '72'::jsonb, 'Janela de atribuicao de resposta (horas)');

-- Espelha as colunas vivas de talkx_campaigns relevantes ao delta (SEM read_count).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
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
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  worker_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- Espelha as colunas vivas de talkx_recipients relevantes ao delta (read_at JÁ existe — V17).
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  external_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  reply_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.contacts (id, phone) VALUES
  ('$contact_phone', '5511988887777'),
  ('$contact_win',   '5511977776666');
INSERT INTO public.messages (id) VALUES ('$msg_1');

-- C1: recibo read-sem-delivered.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count)
  VALUES ('$c_receipt', 'Recibos X027', 'Oi', 'sending', '$conn_1', 1, 1);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at)
  VALUES ('$r_receipt', '$c_receipt', '$contact_phone', 'WA-X027-1', 'sent', statement_timestamp() - interval '1 hour');

-- C2: invólucro record_talkx_recipient_delivered.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count)
  VALUES ('$c_wrap', 'Involucro X027', 'Oi', 'sending', '$conn_2', 1, 1);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at)
  VALUES ('$r_wrap', '$c_wrap', '$contact_phone', 'WA-X027-2', 'sent', statement_timestamp() - interval '1 hour');

-- C3: eixo telefone (contact_id do chamador != contact_id do destinatário).
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count)
  VALUES ('$c_phone', 'Telefone X027', 'Oi', 'sending', '$conn_1', 1, 1);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at)
  VALUES ('$r_phone', '$c_phone', '$contact_phone', 'WA-X027-3', 'sent', statement_timestamp() - interval '1 hour');

-- C4: janela (60h) — atribui só quando reply_window_hours=72.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count)
  VALUES ('$c_win', 'Janela X027', 'Oi', 'sending', '$conn_1', 1, 1);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at)
  VALUES ('$r_win', '$c_win', '$contact_win', 'WA-X027-4', 'sent', statement_timestamp() - interval '60 hours');

-- C5: tempos de resposta 120s e 202s.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count)
  VALUES ('$c_stats', 'Stats X027', 'Oi', 'sending', '$conn_1', 2, 2);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at, replied_at)
  VALUES
    ('$r_s1', '$c_stats', '$contact_phone', 'WA-X027-5', 'sent',
     statement_timestamp() - interval '1000 seconds',
     statement_timestamp() - interval '1000 seconds' + interval '120 seconds'),
    ('$r_s2', '$c_stats', '$contact_win', 'WA-X027-6', 'sent',
     statement_timestamp() - interval '1000 seconds',
     statement_timestamp() - interval '1000 seconds' + interval '202 seconds');
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do X027
# ═════════════════════════════════════════════════════════════════════════════
red_col="$(psql_raw "SELECT read_count FROM public.talkx_campaigns LIMIT 1")"
assert_has 'RED: talkx_campaigns.read_count nao existe antes da X027' 'does not exist' "$red_col"

red_receipt="$(psql_raw "SELECT public.record_talkx_recipient_receipt('WA-X027-1', '$conn_1', 'read')")"
assert_has 'RED: record_talkx_recipient_receipt nao existe antes da X027' 'does not exist' "$red_receipt"

red_reply="$(psql_raw "SELECT public.attribute_talkx_reply('$contact_other', '5511988887777', '$msg_1')")"
assert_has 'RED: attribute_talkx_reply nao existe antes da X027' 'does not exist' "$red_reply"

red_stats="$(psql_raw "SELECT public.talkx_campaign_reply_stats('$c_stats')")"
assert_has 'RED: talkx_campaign_reply_stats nao existe antes da X027' 'does not exist' "$red_stats"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration X027
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration X027 nao aplicou (GREEN)'
pass "migration X027 aplicada ($(basename "$migration"))"

# ── 1) read SEM delivered → delivered_at + read_at, delivered_count=1, read_count=1 ──
read1="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.record_talkx_recipient_receipt('WA-X027-1', '$conn_1', 'read');
COMMIT;
SQL
)"
assert_has 'GREEN: read sem delivered -> RPC true' 't' "$read1"

stamps="$(psql_val "SELECT (delivered_at IS NOT NULL)::text || '|' || (read_at IS NOT NULL)::text FROM public.talkx_recipients WHERE id='$r_receipt'")"
assert_eq 'GREEN: read sem delivered preenche delivered_at e read_at' 'true|true' "$stamps"

counts="$(psql_val "SELECT delivered_count::text || '|' || read_count::text FROM public.talkx_campaigns WHERE id='$c_receipt'")"
assert_eq 'GREEN: read sem delivered -> delivered_count=1, read_count=1' '1|1' "$counts"

# ── 2) repetir o evento → contadores iguais (idempotente) ─────────────────────
again="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.record_talkx_recipient_receipt('WA-X027-1', '$conn_1', 'read');
SELECT public.record_talkx_recipient_receipt('WA-X027-1', '$conn_1', 'delivered');
COMMIT;
SQL
)"
assert_not_has 'GREEN: repetir read/delivered nao devolve true' 't' "$again"
counts2="$(psql_val "SELECT delivered_count::text || '|' || read_count::text FROM public.talkx_campaigns WHERE id='$c_receipt'")"
assert_eq 'GREEN: repetir o evento -> contadores iguais' '1|1' "$counts2"

# ── 3) record_talkx_recipient_delivered continua sendo involucro ─────────────
wdel="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.record_talkx_recipient_delivered('WA-X027-2', '$conn_2');
COMMIT;
SQL
)"
assert_has 'GREEN: involucro delivered (2 args) -> true' 't' "$wdel"
wread="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.record_talkx_recipient_delivered('WA-X027-2', '$conn_2', 'read');
COMMIT;
SQL
)"
assert_has 'GREEN: involucro read (3 args) -> true' 't' "$wread"
wcounts="$(psql_val "SELECT delivered_count::text || '|' || read_count::text FROM public.talkx_campaigns WHERE id='$c_wrap'")"
assert_eq 'GREEN: involucro roteia para a RPC canonica (delivered=1, read=1)' '1|1' "$wcounts"

# ── 4) eixo telefone: mesmo telefone, OUTRO contact_id → atribuída ───────────
phone_reply="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.attribute_talkx_reply('$contact_other', '5511988887777', '$msg_1');
COMMIT;
SQL
)"
assert_has 'GREEN: resposta por telefone (outro contact_id) -> attributed true' '"attributed": true' "$phone_reply"
assert_has 'GREEN: atribuicao marcada como phone' '"attribution": "phone"' "$phone_reply"
phone_replied="$(psql_val "SELECT (replied_at IS NOT NULL)::text || '|' || COALESCE(reply_message_id::text,'NULL') FROM public.talkx_recipients WHERE id='$r_phone'")"
assert_eq 'GREEN: telefone gravou replied_at + reply_message_id' "true|$msg_1" "$phone_replied"

# ── 5) janela: setting 48 → resposta com 60h NÃO atribui; 72 → atribui ────────
psql_exec >/dev/null <<SQL
UPDATE public.talkx_settings SET value='48'::jsonb WHERE key='reply_window_hours';
SQL
win48="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.attribute_talkx_reply('$contact_win', '5511977776666', '$msg_1');
COMMIT;
SQL
)"
assert_has 'GREEN: setting 48 + resposta com 60h -> NAO atribui' '"attributed": false' "$win48"
assert_has 'GREEN: motivo no_recipient_in_window' 'no_recipient_in_window' "$win48"
win_null="$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$r_win'")"
assert_eq 'GREEN: replied_at continua NULL com janela 48' 'true' "$win_null"

psql_exec >/dev/null <<SQL
UPDATE public.talkx_settings SET value='72'::jsonb WHERE key='reply_window_hours';
SQL
win72="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.attribute_talkx_reply('$contact_win', '5511977776666', '$msg_1');
COMMIT;
SQL
)"
assert_has 'GREEN: setting 72 + resposta com 60h -> atribui' '"attributed": true' "$win72"

# ── 6) avg/median de tempo de resposta (120s e 202s → 161) ───────────────────
stats="$(psql_val "SELECT s->>'replied' FROM (SELECT public.talkx_campaign_reply_stats('$c_stats') AS s) q")"
assert_eq 'GREEN: reply_stats replied=2' '2' "$stats"
avg_ok="$(psql_val "SELECT ((s->>'avg_reply_seconds')::numeric = 161)::text FROM (SELECT public.talkx_campaign_reply_stats('$c_stats') AS s) q")"
assert_eq 'GREEN: avg_reply_seconds = 161' 'true' "$avg_ok"
med_ok="$(psql_val "SELECT ((s->>'median_reply_seconds')::numeric = 161)::text FROM (SELECT public.talkx_campaign_reply_stats('$c_stats') AS s) q")"
assert_eq 'GREEN: median_reply_seconds = 161' 'true' "$med_ok"

# ── 7) pg_publication_tables lista read_at ───────────────────────────────────
pub="$(psql_val "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_recipients' AND (attnames IS NULL OR 'read_at' = ANY(attnames))")"
assert_eq 'GREEN: pg_publication_tables lista read_at' '1' "$pub"

# ── 8) ACL: anon não executa as RPCs de recibo/resposta ──────────────────────
acl_receipt="$(psql_script <<SQL
BEGIN;
SET LOCAL role anon;
SET LOCAL request.jwt.claim.role='anon';
SELECT public.record_talkx_recipient_receipt('WA-X027-1', '$conn_1', 'read');
COMMIT;
SQL
)"
assert_has 'GREEN: anon nao executa record_talkx_recipient_receipt' 'permission denied' "$acl_receipt"
acl_reply="$(psql_script <<SQL
BEGIN;
SET LOCAL role anon;
SET LOCAL request.jwt.claim.role='anon';
SELECT public.attribute_talkx_reply('$contact_other', '5511988887777', '$msg_1');
COMMIT;
SQL
)"
assert_has 'GREEN: anon nao executa attribute_talkx_reply' 'permission denied' "$acl_reply"

# ── 9) idempotência: reaplicar a migration não quebra nem duplica publicação ──
psql_exec < "$migration" >/dev/null || fail 'migration X027 nao reaplicou (idempotencia)'
pub_rows="$(psql_val "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='talkx_recipients'")"
assert_eq 'GREEN: reaplicar nao duplica a entrada da publicacao' '1' "$pub_rows"
fn_rows="$(psql_val "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_talkx_recipient_receipt','attribute_talkx_reply','talkx_campaign_reply_stats')")"
assert_eq 'GREEN: reaplicar nao duplica as RPCs' '3' "$fn_rows"

echo '[OK] Talk X X027: lidas, respostas e tempo de resposta no banco (recibos idempotentes, atribuicao por telefone, janela configuravel, stats e realtime com read_at).'
