#!/usr/bin/env bash
# Talk X · recorrência de campanha (cartão t_1dbea713, refazer 3).
#
# Aplica a migration REAL 20261006232024_talkx_campaign_recurrence.sql sobre um
# schema mínimo num PostgreSQL 17 descartável e prova, contra o código real:
#   (a) dedup anti-reenvio: sending/sent/delivered/outcome_unknown da 1ª
#       ocorrência NÃO voltam na 2ª; a 3ª ocorrência exclui quem recebeu em
#       QUALQUER ocorrência anterior;
#   (b) failed/skipped/cancelled/pending VOLTAM para a lista (nada foi enviado);
#   (c) pausada/cancelada (não-completed) devolve reason=not_completed SEM filha;
#   (d) idempotência: 2ª chamada devolve already_scheduled com o MESMO
#       campaign_id e sem linha nova;
#   (e) a CHECK talkx_recipients_status_check cobre os 8 status de envio
#       (prova de que a lista acima é exaustiva).
#
# talkx_audience_query é STUB (expande audience_filters->contact_ids): o contrato
# sob teste é o dedup da RPC de recorrência (cláusula NOT EXISTS), não a
# resolução de audiência (coberta por talkx-audience-rpc/snapshot.test.sh).
#
# Contrato no mesmo formato dos testes irmãos (talkx-draft-recipients.test.sh):
# AUSÊNCIA DE MEDIÇÃO CONTA COMO FALHA (CASES_SEEN vs CASES_EXPECTED).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_RECURRENCE_TEST_MIGRATION:-$repo_root/supabase/migrations/20261006232024_talkx_campaign_recurrence.sql}"
postgres_image="${TALKX_CAMPAIGN_RECURRENCE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-campaign-recurrence-test-$$"
test_password="talkx_campaign_recurrence_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  migration_applies check_status_coverage
  dedup_second_occurrence reentry_failed_skipped_cancelled_pending
  dedup_third_occurrence not_completed_no_child idempotence_already_scheduled
)
case_done() { CASES_SEEN["$1"]=1; }

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
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres || fail 'PostgreSQL de teste não iniciou'

# ---------------------------------------------------------------------------
# Schema mínimo: só o que a migration de recorrência toca.
# (Colunas de recorrência NÃO são pré-criadas: é a migration que as adiciona.)
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
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

CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'segmento',
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.talkx_campaign_segments (
  campaign_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 1,
  PRIMARY KEY (campaign_id, segment_id)
);

-- Colunas lidas/gravadas pela RPC (ver INSERT/UPDATE de
-- schedule_next_talkx_recurrence); recurrence_* vem da migration.
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 'Olá',
  variables_config jsonb,
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
  completed_at timestamptz,
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
  consent_confirmed_by uuid,
  consent_confirmed_at timestamptz,
  legal_basis text,
  owner uuid,
  responsible_id uuid,
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  audience_snapshot_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- CHECK com os 8 status de envio (igual à definição vigente no repo:
-- 20260911180000 + V12 20260930650000 que soma 'cancelled').
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  segment_id uuid,
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (campaign_id, contact_id),
  CONSTRAINT talkx_recipients_status_check CHECK (
    status = ANY (ARRAY['pending','sending','sent','delivered','failed','skipped','outcome_unknown','cancelled'])
  )
);

-- STUB de audiência: expande audience_filters->contact_ids (o contrato sob
-- teste é o dedup da RPC, não a resolução de audiência).
CREATE FUNCTION public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect_suppression boolean)
RETURNS TABLE (id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)
LANGUAGE sql STABLE AS $$
  SELECT unnest(COALESCE(p_contact_ids, ARRAY[]::uuid[])), false, false, false
$$;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
SQL

# ---------------------------------------------------------------------------
# (a) migration REAL aplica
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'migration de recorrencia nao aplicou'
pass '(migration) recorrencia aplicada sobre o schema minimo'
case_done migration_applies

# ---------------------------------------------------------------------------
# (e) CHECK cobre os 8 status (lista exaustiva da prova)
# ---------------------------------------------------------------------------
check_def="$(psql_q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'talkx_recipients_status_check'")"
for st in pending sending sent delivered failed skipped outcome_unknown cancelled; do
  [[ "$check_def" == *"$st"* ]] || fail "CHECK sem status '$st': $check_def"
done
pass "(check) talkx_recipients_status_check cobre os 8 status: $check_def"
case_done check_status_coverage

# 8 contatos fixos: c1..c4 já receberam (ou podem ter recebido), c5..c8 não.
c1='30000000-0000-0000-0000-000000000001'
c2='30000000-0000-0000-0000-000000000002'
c3='30000000-0000-0000-0000-000000000003'
c4='30000000-0000-0000-0000-000000000004'
c5='30000000-0000-0000-0000-000000000005'
c6='30000000-0000-0000-0000-000000000006'
c7='30000000-0000-0000-0000-000000000007'
c8='30000000-0000-0000-0000-000000000008'
parent='51000000-0000-0000-0000-000000000001'
SR="SET request.jwt.claim.role='service_role';"

psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns
  (id, name, status, audience_source, audience_filters, scheduled_at, completed_at, created_by, recurrence_frequency)
VALUES
  ('$parent', 'Serie diaria', 'completed', 'contacts',
   '{"contact_ids":["$c1","$c2","$c3","$c4","$c5","$c6","$c7","$c8"]}'::jsonb,
   statement_timestamp() - interval '2 days', statement_timestamp(),
   '10000000-0000-0000-0000-000000000001', 'daily');
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status) VALUES
  ('$parent', '$c1', 'sending'),
  ('$parent', '$c2', 'sent'),
  ('$parent', '$c3', 'delivered'),
  ('$parent', '$c4', 'outcome_unknown'),
  ('$parent', '$c5', 'failed'),
  ('$parent', '$c6', 'skipped'),
  ('$parent', '$c7', 'cancelled'),
  ('$parent', '$c8', 'pending');
SQL

# ---------------------------------------------------------------------------
# (a)+(b) 2ª ocorrência: só c5..c8
# ---------------------------------------------------------------------------
out1="$(psql_q "$SR SELECT public.schedule_next_talkx_recurrence('$parent')")"
[[ "$out1" == *'"scheduled": true'* ]] || fail "esperava scheduled=true, veio: $out1"
child="$(psql_q "SELECT recurrence_next_campaign_id FROM public.talkx_campaigns WHERE id = '$parent'")"
[[ -n "$child" ]] || fail 'parent sem recurrence_next_campaign_id apos agendar'
kids="$(psql_q "SELECT string_agg(contact_id::text, ',' ORDER BY contact_id::text) FROM public.talkx_recipients WHERE campaign_id = '$child'")"
esperado="$c5,$c6,$c7,$c8"
[[ "$kids" == "$esperado" ]] || fail "2a ocorrencia com lista errada: $kids (esperado $esperado)"
pass "(dedup) 2a ocorrencia sem sending/sent/delivered/outcome_unknown: $kids"
case_done dedup_second_occurrence
pass "(reentrada) failed/skipped/cancelled/pending voltaram: $kids"
case_done reentry_failed_skipped_cancelled_pending

# série futura preservada (parede local, sem deriva): filha depois do pai.
cmp="$(psql_q "SELECT (SELECT scheduled_at FROM public.talkx_campaigns WHERE id = '$child') > (SELECT scheduled_at FROM public.talkx_campaigns WHERE id = '$parent')")"
[[ "$cmp" == "t" ]] || fail 'scheduled_at da filha nao e futuro em relacao ao pai'

# ---------------------------------------------------------------------------
# (d) idempotência: 2ª chamada = already_scheduled, mesmo id, sem linha nova
# ---------------------------------------------------------------------------
n_before="$(psql_q "SELECT count(*) FROM public.talkx_campaigns")"
out2="$(psql_q "$SR SELECT public.schedule_next_talkx_recurrence('$parent')")"
[[ "$out2" == *"already_scheduled"* ]] || fail "esperava already_scheduled, veio: $out2"
[[ "$out2" == *"$child"* ]] || fail "already_scheduled com id diferente: $out2 (esperado $child)"
n_after="$(psql_q "SELECT count(*) FROM public.talkx_campaigns")"
[[ "$n_before" == "$n_after" ]] || fail "idempotencia quebrou: $n_before -> $n_after campanhas"
pass "(idempotencia) already_scheduled com o mesmo id e sem linha nova"
case_done idempotence_already_scheduled

# ---------------------------------------------------------------------------
# (a) 3ª ocorrência: c5 agora foi enviado (sent) e some; c6..c8 voltam
# ---------------------------------------------------------------------------
psql_test >/dev/null <<SQL
UPDATE public.talkx_recipients SET status = 'sent' WHERE campaign_id = '$child' AND contact_id = '$c5';
UPDATE public.talkx_campaigns SET status = 'completed', completed_at = statement_timestamp() WHERE id = '$child';
SQL
out3="$(psql_q "$SR SELECT public.schedule_next_talkx_recurrence('$child')")"
[[ "$out3" == *'"scheduled": true'* ]] || fail "3a ocorrencia nao agendou: $out3"
grandchild="$(psql_q "SELECT recurrence_next_campaign_id FROM public.talkx_campaigns WHERE id = '$child'")"
kids3="$(psql_q "SELECT string_agg(contact_id::text, ',' ORDER BY contact_id::text) FROM public.talkx_recipients WHERE campaign_id = '$grandchild'")"
esperado3="$c6,$c7,$c8"
[[ "$kids3" == "$esperado3" ]] || fail "3a ocorrencia com lista errada: $kids3 (esperado $esperado3)"
serie3="$(psql_q "SELECT recurrence_series_id FROM public.talkx_campaigns WHERE id = '$grandchild'")"
[[ "$serie3" == "$parent" ]] || fail "serie da 3a ocorrencia errada: $serie3 (esperado $parent)"
pass "(dedup) 3a ocorrencia exclui quem recebeu em QUALQUER anterior: $kids3"
case_done dedup_third_occurrence

# ---------------------------------------------------------------------------
# (c) pausada/cancelada: not_completed SEM filha
# ---------------------------------------------------------------------------
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns
  (id, name, status, audience_source, audience_filters, scheduled_at, created_by, recurrence_frequency)
VALUES
  ('51000000-0000-0000-0000-00000000000a', 'Pausada', 'paused', 'contacts', '{}'::jsonb,
   statement_timestamp() - interval '2 days', '10000000-0000-0000-0000-000000000001', 'daily'),
  ('51000000-0000-0000-0000-00000000000b', 'Cancelada', 'cancelled', 'contacts', '{}'::jsonb,
   statement_timestamp() - interval '2 days', '10000000-0000-0000-0000-000000000001', 'daily');
SQL
n0="$(psql_q "SELECT count(*) FROM public.talkx_campaigns")"
outp="$(psql_q "$SR SELECT public.schedule_next_talkx_recurrence('51000000-0000-0000-0000-00000000000a')")"
outc="$(psql_q "$SR SELECT public.schedule_next_talkx_recurrence('51000000-0000-0000-0000-00000000000b')")"
[[ "$outp" == *"not_completed"* ]] || fail "pausada deveria ser not_completed: $outp"
[[ "$outc" == *"not_completed"* ]] || fail "cancelada deveria ser not_completed: $outc"
n1="$(psql_q "SELECT count(*) FROM public.talkx_campaigns")"
[[ "$n0" == "$n1" ]] || fail "not_completed criou filha: $n0 -> $n1"
pass "(estado) paused/cancelled = not_completed sem filha"
case_done not_completed_no_child

# ---------------------------------------------------------------------------
# Ausência de medição = falha
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ -n "${CASES_SEEN[$c]:-}" ]] || fail "caso nao executado: $c"
done
printf '[OK] Talk X recorrencia: dedup em 3 ocorrencias + reentrada + not_completed + idempotencia.\n'
