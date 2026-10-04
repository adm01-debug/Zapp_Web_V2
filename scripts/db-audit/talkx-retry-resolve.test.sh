#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — X031.
# Fecha CAP-047, CAP-048, CAP-049.
#
# Prova, em PostgreSQL 17, o delta de X031:
#   RED (antes da migration):
#     - talkx_recipients.manual_retry_count NÃO existe;
#     - public.retry_talkx_recipients NÃO existe.
#   GREEN (depois):
#     - failed -> retry -> pending com retry_after preenchido e failed_count -1;
#     - 4º retry manual (manual_retry_count=3) -> erro talkx_retry_limit_reached;
#     - contato suprimido entre a falha e o retry -> recusado (talkx_retry_recipient_suppressed);
#     - campanha 'completed' reabre para 'sending' e gera evento 'resumed' com ator;
#     - resolve_talkx_outcome_unknown('mark_sent') move outcome_unknown_count -> sent_count;
#     - 'retry' sem p_confirm_duplicate_risk -> erro talkx_duplicate_risk_confirmation_required;
#     - 'retry' com confirmação reabre para pending e move o contador;
#     - agente (não admin/supervisor) -> SQLSTATE 42501.
#
# A migration é encontrada pelo marcador interno 'talkx_x031_objetos_ausentes'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/x031.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_x031_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/x031.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration X031 nao encontrada (marcador talkx_x031_objetos_ausentes)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x031-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-x031-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

# Executa uma expressão como usuário autenticado (SET LOCAL valendo no SELECT).
as_user() {
  local uid="$1" sql="$2"
  psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$uid';
$sql;
COMMIT;
SQL
}

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

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_X031_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x031_test_only "$pg_image" >/dev/null

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
user_admin='a0000000-0000-0000-0000-000000000001'
user_agent='a0000000-0000-0000-0000-000000000002'
profile_admin='b0000000-0000-0000-0000-000000000001'
profile_agent='b0000000-0000-0000-0000-000000000002'
contact_ok='c0000000-0000-0000-0000-000000000001'
contact_supp='c0000000-0000-0000-0000-000000000002'
c_sending='d0000000-0000-0000-0000-000000000001'
c_completed='d0000000-0000-0000-0000-000000000002'
c_unknown='d0000000-0000-0000-0000-000000000003'
r_failed='e0000000-0000-0000-0000-000000000001'
r_capped='e0000000-0000-0000-0000-000000000002'
r_supp='e0000000-0000-0000-0000-000000000003'
r_done='e0000000-0000-0000-0000-000000000004'
r_unknown='e0000000-0000-0000-0000-000000000005'
r_unknown2='e0000000-0000-0000-0000-000000000006'

# ── fixtures mínimos (o suficiente para o delta de X031 rodar) ────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text, deleted_at timestamptz);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  removed_at timestamptz,
  expires_at timestamptz
);

-- is_admin_or_supervisor REAL simplificada para o fixture (só o admin é admin);
-- o caminho completo (user_roles) é coberto pelos testes de X014.
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT _uid = 'a0000000-0000-0000-0000-000000000001'::uuid $$;

-- Espelha as colunas vivas de talkx_campaigns relevantes ao guard/RPC.
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT '',
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  paused_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  launched_by uuid,
  launched_at timestamptz,
  pause_reason text,
  worker_id text,
  worker_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- Espelha as colunas vivas de talkx_recipients ANTES de X031 (sem manual_retry_count).
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','delivered','failed','skipped','outcome_unknown','cancelled')),
  personalized_message text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  external_id text,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  delivery_last_claim_token uuid,
  provider_dispatch_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_recipients_delivery_claim_state CHECK (
    (status = 'sending' AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL
       AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL)
    OR (status <> 'sending' AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL
       AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)
  )
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type IN
    ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note'))
);
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('$profile_admin', '$user_admin', true),
  ('$profile_agent', '$user_agent', true);
INSERT INTO public.contacts (id, phone, deleted_at) VALUES
  ('$contact_ok', '5511900000001', NULL),
  ('$contact_supp', '5511900000002', NULL);

INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by, failed_count, outcome_unknown_count)
  VALUES
  ('$c_sending', 'Em envio', 'Oi', 'sending', '$profile_admin', 3, 0),
  ('$c_completed', 'Concluida', 'Oi', 'completed', '$profile_admin', 1, 0),
  ('$c_unknown', 'Com incerto', 'Oi', 'sending', '$profile_admin', 0, 2);

INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status) VALUES
  ('$r_failed',  '$c_sending',   '$contact_ok',   'failed'),
  ('$r_capped',  '$c_sending',   '$contact_ok',   'failed'),
  ('$r_supp',    '$c_sending',   '$contact_supp', 'failed'),
  ('$r_done',    '$c_completed', '$contact_ok',   'failed'),
  ('$r_unknown', '$c_unknown',   '$contact_ok',   'outcome_unknown'),
  ('$r_unknown2','$c_unknown',   '$contact_ok',   'outcome_unknown');
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do X031
# ═════════════════════════════════════════════════════════════════════════════
red_col="$(psql_raw "SELECT manual_retry_count FROM public.talkx_recipients LIMIT 1")"
assert_has 'RED: manual_retry_count nao existe antes da X031' 'does not exist' "$red_col"

red_fn="$(psql_raw "SELECT public.retry_talkx_recipients('$c_sending', ARRAY['$r_failed']::uuid[])")"
assert_has 'RED: retry_talkx_recipients nao existe antes da X031' 'does not exist' "$red_fn"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration X031
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration X031 nao aplicou (GREEN)'
pass "migration X031 aplicada ($(basename "$migration"))"

col_exists="$(psql_val "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_recipients' AND column_name='manual_retry_count'")"
assert_eq 'GREEN: coluna manual_retry_count existe' '1' "$col_exists"

# stubs de captura de SQLSTATE (SECURITY INVOKER: auth.role/uid valem do SET LOCAL)
psql_exec >/dev/null <<'SQL'
CREATE FUNCTION public._x031_try_retry(p_campaign uuid, p_ids uuid[]) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'OK|' || public.retry_talkx_recipients(p_campaign, p_ids)::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || '|' || SQLERRM;
END $$;
CREATE FUNCTION public._x031_try_resolve(p_recipient uuid, p_resolution text, p_note text, p_confirm boolean) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'OK|' || public.resolve_talkx_outcome_unknown(p_recipient, p_resolution, p_note, p_confirm)::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || '|' || SQLERRM;
END $$;
SQL

# teto de 3: marca o 3º reenvio já consumido
psql_exec >/dev/null <<SQL
UPDATE public.talkx_recipients SET manual_retry_count = 3 WHERE id = '$r_capped';
SQL

# ── 1) failed -> retry -> pending e failed_count -1 ──────────────────────────
out1="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending', ARRAY['$r_failed']::uuid[])")"
assert_has '1. retry de failed como admin -> OK' 'OK|' "$out1"

row1="$(psql_val "SELECT status || '|' || manual_retry_count::text || '|' || (retry_after IS NOT NULL)::text || '|' || (provider_dispatch_started_at IS NULL)::text FROM public.talkx_recipients WHERE id='$r_failed'")"
assert_eq '1. failed -> pending, manual_retry_count=1, retry_after set, dispatch limpo' 'pending|1|true|true' "$row1"
count1="$(psql_val "SELECT failed_count FROM public.talkx_campaigns WHERE id='$c_sending'")"
assert_eq '1. failed_count 3 -> 2' '2' "$count1"
ev1="$(psql_val "SELECT event_type || '|' || COALESCE(actor_id::text,'NULL') FROM public.talkx_campaign_events WHERE campaign_id='$c_sending' AND message LIKE '%retry_talkx_recipients%' ORDER BY created_at DESC LIMIT 1")"
assert_eq '1. evento gravado com ator (note|perfil admin)' "note|$profile_admin" "$ev1"

# ── 2) 4º retry manual -> erro ───────────────────────────────────────────────
out2="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending', ARRAY['$r_capped']::uuid[])")"
assert_has '2. 4º retry manual (manual_retry_count=3) -> erro' 'talkx_retry_limit_reached' "$out2"

# ── 3) contato suprimido entre a falha e o retry -> recusado ─────────────────
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_blacklist (contact_id, removed_at) VALUES ('$contact_supp', NULL);
SQL
out3="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending', ARRAY['$r_supp']::uuid[])")"
assert_has '3. contato suprimido -> recusado' 'talkx_retry_recipient_suppressed' "$out3"
row3="$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_supp'")"
assert_eq '3. destinatario suprimido continua failed' 'failed' "$row3"

# ── 4) campanha completed reabre e gera evento ───────────────────────────────
out4="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_completed', ARRAY['$r_done']::uuid[])")"
assert_has '4. retry em campanha completed -> OK' 'OK|' "$out4"
status4="$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_completed'")"
assert_eq '4. campanha completed -> sending' 'sending' "$status4"
ev4="$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_completed' AND event_type='resumed' AND actor_id='$profile_admin'")"
assert_eq '4. evento resumed com ator gerado' '1' "$ev4"

# ── 5) mark_sent move o contador ─────────────────────────────────────────────
out5="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown','mark_sent',NULL,false)")"
assert_has '5. resolve mark_sent -> OK' 'OK|' "$out5"
unk5="$(psql_val "SELECT outcome_unknown_count || '|' || sent_count FROM public.talkx_campaigns WHERE id='$c_unknown'")"
assert_eq '5. outcome_unknown_count 2->1 e sent_count 0->1' '1|1' "$unk5"
st5="$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_unknown'")"
assert_eq '5. destinatario vira sent' 'sent' "$st5"

# ── 6) retry sem confirmação -> erro ─────────────────────────────────────────
out6="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown2','retry',NULL,false)")"
assert_has '6. retry sem confirmacao -> erro' 'talkx_duplicate_risk_confirmation_required' "$out6"

# ── 6b) retry com confirmação reabre e move o contador ───────────────────────
out6b="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown2','retry','confere que nao chegou',true)")"
assert_has '6b. retry com confirmacao -> OK' 'OK|' "$out6b"
unk6="$(psql_val "SELECT outcome_unknown_count || '|' || (SELECT status FROM public.talkx_recipients WHERE id='$r_unknown2') FROM public.talkx_campaigns WHERE id='$c_unknown'")"
assert_eq '6b. outcome_unknown_count 1->0 e destinatario pending' '0|pending' "$unk6"

# ── 7) agente -> 42501 ───────────────────────────────────────────────────────
out7="$(as_user "$user_agent" "SELECT public._x031_try_retry('$c_sending', ARRAY['$r_failed']::uuid[])")"
assert_has '7. agente -> SQLSTATE 42501' '42501|talkx_retry_role_required' "$out7"

# ── 8) idempotência: reaplicar a migration não quebra ────────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration X031 nao reaplicou (idempotencia)'
pass 'migration X031 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X X031: reenvio manual em lote com teto de 3, revalidacao de supressao/elegibilidade, reabertura de campanha completed, resolucao de outcome_unknown por RPC com trilha e gate de agente.'
