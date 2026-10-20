#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — X031.
# Fecha CAP-047, CAP-048, CAP-049.
#
# Prova, em PostgreSQL 17, o delta de X031:
#   #124 (R3-DELTA-005, caderno §11.1): a reabertura de campanha 'completed' por retry nao
#     exigia a NOVA confirmacao de lancamento. A secao #124 prova o defeito no estado vivo
#     (reabre sem confirmacao/base legal) e o gate depois (talkx_relaunch_confirmation_required,
#     carimbo renovado na reabertura confirmada, caminho que nao reabre intacto).
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
# Seção #123 (R3-DELTA-004, P2) — o retry em lote aceitava IDs inexistentes:
#   RED (corpo vivo de X031):
#     - lote só com id inexistente -> OK, campanha 'completed' reaberta para 'sending'
#       SEM nenhum destinatário pendente;
#     - lote misto (id válido + inexistente) -> aceito, retentando só a parte válida.
#   GREEN (migration de correção, marcador 'talkx_retry_ids_inexistentes'):
#     - todo id pedido precisa existir NA campanha: 'talkx_retry_recipient_not_found'
#       (P0002), tudo-ou-nada, campanha e destinatários intactos;
#     - id de outra campanha também é recusado; nulo no array -> invalid_talkx_retry_request;
#     - id válido continua reabrindo a campanha, com um pendente de verdade.
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

# Migration do #124 (R3-DELTA-005): encontrada pelo marcador interno proprio.
# TALKX_R3DELTA005_MIGRATION sobrepoe (usado no mutation test: sem o gate, a suite tem de falhar).
migration124="${TALKX_R3DELTA005_MIGRATION:-$(grep -rlF 'talkx_r3delta005_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)}"
[[ -n "$migration124" && -f "$migration124" ]] || { printf '[FALHA] migration #124 nao encontrada (marcador talkx_r3delta005_objetos_ausentes)\n' >&2; exit 1; }

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
# #123: id que NÃO existe em campanha nenhuma, campanhas/destinatários próprios da
# seção (a chamada defeituosa MUTA a campanha, então RED e GREEN não compartilham fixture).
id_inexistente='f0000000-0000-0000-0000-0000000000ff'
c_ids_red='d0000000-0000-0000-0000-000000000004'
c_ids_green='d0000000-0000-0000-0000-000000000005'
r_ids_red='e0000000-0000-0000-0000-000000000007'
r_ids_green='e0000000-0000-0000-0000-000000000008'
r_ids_outra='e0000000-0000-0000-0000-000000000009'
c_reopen='d0000000-0000-0000-0000-000000000124'
c_reopen_unknown='d0000000-0000-0000-0000-000000000125'
c_sending2='d0000000-0000-0000-0000-000000000126'
c_reopen_no_legal='d0000000-0000-0000-0000-000000000127'
c_reopen_unknown_empty_legal='d0000000-0000-0000-0000-000000000128'
r_reopen='e0000000-0000-0000-0000-000000000124'
r_unknown3='e0000000-0000-0000-0000-000000000125'
r_failed2='e0000000-0000-0000-0000-000000000126'
r_reopen_no_legal='e0000000-0000-0000-0000-000000000127'
r_unknown_empty_legal='e0000000-0000-0000-0000-000000000128'
c_rollback='d0000000-0000-0000-0000-000000000129'
r_rollback='e0000000-0000-0000-0000-000000000129'

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
  -- X032 (colunas vivas do lancamento): a reabertura por retry (#124) exige a NOVA
  -- confirmacao de lancamento e grava o carimbo autor+instante.
  consent_confirmed_by uuid,
  consent_confirmed_at timestamptz,
  legal_basis text,
  confirm_consent boolean NOT NULL DEFAULT false,
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

-- #124: campanhas 'completed' COM carimbo de lancamento antigo, 'completed' sem carimbo e
-- 'sending' (caminho que NAO reabre) para separar o gate da reabertura do retry normal.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by, failed_count,
                                    outcome_unknown_count, completed_at, consent_confirmed_by,
                                    consent_confirmed_at, legal_basis)
  VALUES
  ('$c_reopen',                    'Concluida com carimbo',       'Oi', 'completed', '$profile_admin', 1, 0, now() - interval '1 day', '$profile_admin', now() - interval '2 days', 'consent'),
  ('$c_reopen_unknown',            'Concluida incerta',           'Oi', 'completed', '$profile_admin', 0, 1, now() - interval '1 day', '$profile_admin', now() - interval '2 days', 'consent'),
  ('$c_sending2',                  'Em envio sem carimbo',        'Oi', 'sending',   '$profile_admin', 1, 0, NULL, NULL, NULL, NULL),
  ('$c_reopen_no_legal',           'Concluida sem base legal',    'Oi', 'completed', '$profile_admin', 1, 0, now() - interval '1 day', '$profile_admin', now() - interval '2 days', NULL),
  ('$c_reopen_unknown_empty_legal','Concluida base legal vazia',  'Oi', 'completed', '$profile_admin', 0, 1, now() - interval '1 day', '$profile_admin', now() - interval '2 days', '');

INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status) VALUES
  ('$r_reopen',              '$c_reopen',                     '$contact_ok', 'failed'),
  ('$r_unknown3',            '$c_reopen_unknown',             '$contact_ok', 'outcome_unknown'),
  ('$r_failed2',             '$c_sending2',                   '$contact_ok', 'failed'),
  ('$r_reopen_no_legal',     '$c_reopen_no_legal',            '$contact_ok', 'failed'),
  ('$r_unknown_empty_legal', '$c_reopen_unknown_empty_legal', '$contact_ok', 'outcome_unknown');
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

# X031 e idempotente (reaplicada aqui, ANTES da migration do #124 — a ordem real do replay)
psql_exec < "$migration" >/dev/null || fail 'migration X031 nao reaplicou (idempotencia)'
pass 'migration X031 reaplicada sem erro (idempotencia)'

# stubs de captura de SQLSTATE (SECURITY INVOKER: auth.role/uid valem do SET LOCAL)
psql_exec >/dev/null <<'SQL'
-- Stubs de captura de SQLSTATE. Chamam a assinatura NOVA (#124) quando ela existe — e o que
-- um chamador de 2/4 argumentos faz hoje — para que a reabertura nao confirmada apareca como
-- talkx_relaunch_confirmation_required, e nao como erro de funcao inexistente.
CREATE FUNCTION public._x031_try_retry(p_campaign uuid, p_ids uuid[], p_confirm boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure('public.retry_talkx_recipients(uuid,uuid[],boolean)') IS NOT NULL THEN
    RETURN 'OK|' || public.retry_talkx_recipients(p_campaign, p_ids, p_confirm)::text;
  END IF;
  RETURN 'OK|' || public.retry_talkx_recipients(p_campaign, p_ids)::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || '|' || SQLERRM;
END $$;
CREATE FUNCTION public._x031_try_resolve(p_recipient uuid, p_resolution text, p_note text, p_confirm boolean,
                                        p_confirm_relaunch boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure('public.resolve_talkx_outcome_unknown(uuid,text,text,boolean,boolean)') IS NOT NULL THEN
    RETURN 'OK|' || public.resolve_talkx_outcome_unknown(p_recipient, p_resolution, p_note, p_confirm, p_confirm_relaunch)::text;
  END IF;
  RETURN 'OK|' || public.resolve_talkx_outcome_unknown(p_recipient, p_resolution, p_note, p_confirm)::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || '|' || SQLERRM;
END $$;
SQL

# teto de 3: marca o 3º reenvio já consumido
psql_exec >/dev/null <<SQL
UPDATE public.talkx_recipients SET manual_retry_count = 3 WHERE id = '$r_capped';
SQL

# ORDEM DO REPLAY: X031 (20261003222707) -> #123 (20261006193650) -> #124 (20261006210406).
# A secao #123 roda ANTES da migration do #124, que sobrescreve retry_talkx_recipients (e por isso
# carrega o delta do #123 no corpo novo: ver '#124 8.' mais abaixo).
# ═════════════════════════════════════════════════════════════════════════════
# #123 (R3-DELTA-004) — retry em lote aceita IDs inexistentes e pode reabrir
# campanha sem destinatário. O corpo vivo de X031 conta LINHAS encontradas
# (id inexistente não entra na conta, então "0 = 0" passava) e reabre a campanha
# 'completed' para 'sending' sem nenhum pendente para o tick enviar.
# ═════════════════════════════════════════════════════════════════════════════
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by, failed_count)
  VALUES
  ('$c_ids_red',   'Retry com id inexistente (RED)',   'Oi', 'completed', '$profile_admin', 1),
  ('$c_ids_green', 'Retry com id inexistente (GREEN)', 'Oi', 'completed', '$profile_admin', 1);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status) VALUES
  ('$r_ids_red',   '$c_ids_red',   '$contact_ok', 'failed'),
  ('$r_ids_green', '$c_ids_green', '$contact_ok', 'failed'),
  ('$r_ids_outra', '$c_sending',   '$contact_ok', 'failed');
SQL

# ── RED A: lote inteiramente inexistente é aceito e reabre a campanha sem pendente ──
out_red_a="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_red', ARRAY['$id_inexistente']::uuid[])")"
assert_has '123-RED-A: id inexistente aceito pelo corpo vivo (defeito)' 'OK|' "$out_red_a"
red_a="$(psql_val "SELECT campaign.status || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE campaign_id=campaign.id AND status='pending') || '|' || campaign.failed_count FROM public.talkx_campaigns campaign WHERE campaign.id='$c_ids_red'")"
assert_eq '123-RED-A: campanha completed -> sending SEM pendente (defeito)' 'sending|0|1' "$red_a"

# ── RED B: lote misto (1 válido + 1 inexistente) passa e retenta só a parte válida ──
out_red_b="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_red', ARRAY['$r_ids_red','$id_inexistente']::uuid[])")"
assert_has '123-RED-B: lote misto aceito pelo corpo vivo (defeito)' 'OK|' "$out_red_b"
assert_has '123-RED-B: reenvio PARCIAL (count=1 de 2 ids pedidos)' '"count": 1' "$out_red_b"
red_b="$(psql_val "SELECT status || '|' || manual_retry_count::text FROM public.talkx_recipients WHERE id='$r_ids_red'")"
assert_eq '123-RED-B: id válido do lote misto foi retentado sem os outros' 'pending|1' "$red_b"

# ── aplica a migration de correção (#123) ────────────────────────────────────
fix_migration="$(grep -rlF 'talkx_retry_ids_inexistentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$fix_migration" && -f "$fix_migration" ]] || fail '#123: migration de correcao nao encontrada (marcador talkx_retry_ids_inexistentes)'
psql_exec < "$fix_migration" >/dev/null || fail "#123: migration de correcao nao aplicou ($(basename "$fix_migration"))"
pass "123-GREEN: migration de correcao aplicada ($(basename "$fix_migration"))"

# ── GREEN 1: lote inteiramente inexistente -> recusado, campanha intacta ─────
out_g1="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_green', ARRAY['$id_inexistente']::uuid[])")"
assert_has '123-GREEN-1: id inexistente -> talkx_retry_recipient_not_found (P0002)' 'P0002|talkx_retry_recipient_not_found' "$out_g1"
g1="$(psql_val "SELECT campaign.status || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE campaign_id=campaign.id AND status='pending') || '|' || campaign.failed_count FROM public.talkx_campaigns campaign WHERE campaign.id='$c_ids_green'")"
assert_eq '123-GREEN-1: campanha completed intacta, sem pendente fantasma' 'completed|0|1' "$g1"
g1ev="$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_ids_green' AND event_type='resumed'")"
assert_eq '123-GREEN-1: nenhum evento resumed gerado' '0' "$g1ev"

# ── GREEN 2: lote misto -> recusado por inteiro (tudo-ou-nada), nada retentado ──
out_g2="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_green', ARRAY['$r_ids_green','$id_inexistente']::uuid[])")"
assert_has '123-GREEN-2: lote misto -> recusado' 'P0002|talkx_retry_recipient_not_found' "$out_g2"
g2="$(psql_val "SELECT status || '|' || manual_retry_count::text FROM public.talkx_recipients WHERE id='$r_ids_green'")"
assert_eq '123-GREEN-2: destinatario valido do lote misto intacto' 'failed|0' "$g2"

# ── GREEN 3: id que existe mas é de OUTRA campanha -> recusado ───────────────
out_g3="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_green', ARRAY['$r_ids_outra']::uuid[])")"
assert_has '123-GREEN-3: id de outra campanha -> recusado' 'P0002|talkx_retry_recipient_not_found' "$out_g3"
g3="$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_ids_outra'")"
assert_eq '123-GREEN-3: destinatario da outra campanha intacto' 'failed' "$g3"

# ── GREEN 4: nulo no array não é destinatário pedido (antes passava como "0 = 0") ──
out_g4="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_green', ARRAY[NULL]::uuid[])")"
assert_has '123-GREEN-4: nulo no array -> invalid_talkx_retry_request (22023)' '22023|invalid_talkx_retry_request' "$out_g4"

# ── GREEN 5: id válido continua reabrindo a campanha, com pendente de verdade ──
out_g5="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_ids_green', ARRAY['$r_ids_green']::uuid[])")"
assert_has '123-GREEN-5: id valido continua retentavel' 'OK|' "$out_g5"
assert_has '123-GREEN-5: count do evento = 1' '"count": 1' "$out_g5"
g5="$(psql_val "SELECT campaign.status || '|' || recipient.status || '|' || recipient.manual_retry_count::text || '|' || campaign.failed_count FROM public.talkx_campaigns campaign JOIN public.talkx_recipients recipient ON recipient.campaign_id=campaign.id WHERE campaign.id='$c_ids_green' AND recipient.id='$r_ids_green'")"
assert_eq '123-GREEN-5: campanha sending + 1 pendente + failed_count 0' 'sending|pending|1|0' "$g5"

# ── GREEN 6: a correção é replayável ─────────────────────────────────────────
psql_exec < "$fix_migration" >/dev/null || fail '#123: migration de correcao nao reaplicou (idempotencia)'
pass '123-GREEN-6: migration de correcao reaplicada sem erro (idempotencia)'

# ═════════════════════════════════════════════════════════════════════════════
# RED #124 (R3-DELTA-005) — no estado vivo (X031, sem a migration #124) a reabertura
# de campanha 'completed' acontece SEM a nova confirmacao de lancamento.
# ═════════════════════════════════════════════════════════════════════════════
stamp_old_epoch="$(psql_val "SELECT extract(epoch FROM consent_confirmed_at)::text FROM public.talkx_campaigns WHERE id='$c_reopen'")"

red124_a="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_reopen', ARRAY['$r_reopen']::uuid[])")"
assert_has '#124 RED: retry reabre a campanha SEM nenhuma confirmacao nova (defeito)' 'OK|' "$red124_a"
assert_eq '#124 RED: campanha completed -> sending sem confirmacao' 'sending' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 RED: carimbo antigo intacto (nenhuma confirmacao nova gravada)' "$stamp_old_epoch" \
  "$(psql_val "SELECT extract(epoch FROM consent_confirmed_at)::text FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 RED: trilha nao registra relaunch_confirmed' '0' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_reopen' AND message LIKE '%relaunch_confirmed%'")"

red124_b="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown3','retry','confere que nao chegou',true)")"
assert_has '#124 RED: retry de outcome_unknown tambem reabre SEM confirmacao nova' 'OK|' "$red124_b"
assert_eq '#124 RED: campanha do outcome_unknown reaberta sem confirmacao' 'sending' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen_unknown'")"

# repoe o estado das duas campanhas para o GREEN (completed + carimbo antigo)
psql_exec >/dev/null <<SQL
UPDATE public.talkx_campaigns
   SET status = 'completed', completed_at = statement_timestamp(),
       consent_confirmed_by = '$profile_admin', consent_confirmed_at = to_timestamp($stamp_old_epoch),
       updated_at = statement_timestamp()
 WHERE id IN ('$c_reopen', '$c_reopen_unknown');
UPDATE public.talkx_recipients SET status = 'failed' WHERE id = '$r_reopen';
UPDATE public.talkx_recipients SET status = 'outcome_unknown' WHERE id = '$r_unknown3';
DELETE FROM public.talkx_campaign_events WHERE campaign_id IN ('$c_reopen', '$c_reopen_unknown');
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

# ═════════════════════════════════════════════════════════════════════════════
# GREEN #124 — aplica a migration do #124 e prova a nova confirmacao de lancamento
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration124" >/dev/null || fail 'migration #124 nao aplicou (GREEN)'
pass "migration #124 aplicada ($(basename "$migration124"))"

# ── 1) reabertura SEM a confirmacao nova -> recusada, sem escrever nada ──────
g1="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_reopen', ARRAY['$r_reopen']::uuid[])")"
assert_has '#124 1. reabertura sem confirmacao nova -> erro' 'talkx_relaunch_confirmation_required' "$g1"
assert_eq '#124 1. sem confirmacao: campanha continua completed' 'completed' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 1. sem confirmacao: destinatario continua failed' 'failed' \
  "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_reopen'")"
assert_eq '#124 1. sem confirmacao: carimbo antigo intacto' "$stamp_old_epoch" \
  "$(psql_val "SELECT extract(epoch FROM consent_confirmed_at)::text FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 1. sem confirmacao: nenhum evento gravado' '0' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_reopen'")"

# ── 2) reabertura COM a confirmacao nova -> reabre e renova o carimbo ────────
g2="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_reopen', ARRAY['$r_reopen']::uuid[], true)")"
assert_has '#124 2. reabertura com a confirmacao -> OK' 'OK|' "$g2"
assert_eq '#124 2. campanha completed -> sending' 'sending' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 2. destinatario failed -> pending' 'pending' \
  "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_reopen'")"
assert_eq '#124 2. carimbo renovado: autor = operador confirmante' "$profile_admin" \
  "$(psql_val "SELECT consent_confirmed_by::text FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 2. carimbo renovado: instante posterior ao antigo' 'true' \
  "$(psql_val "SELECT (consent_confirmed_at > to_timestamp($stamp_old_epoch))::text FROM public.talkx_campaigns WHERE id='$c_reopen'")"
assert_eq '#124 2. trilha registra relaunch_confirmed' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_reopen' AND message LIKE '%relaunch_confirmed%'")"
assert_eq '#124 2. evento resumed com ator' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_reopen' AND event_type='resumed' AND actor_id='$profile_admin'")"

# ── 3) retry que NAO reabre (campanha 'sending') segue sem confirmacao nova ──
g3="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending2', ARRAY['$r_failed2']::uuid[])")"
assert_has '#124 3. retry em campanha sending sem confirmacao -> OK (nao reabre)' 'OK|' "$g3"
assert_eq '#124 3. contador e destinatario do caminho normal' '0|pending' \
  "$(psql_val "SELECT (SELECT failed_count FROM public.talkx_campaigns WHERE id='$c_sending2') || '|' || (SELECT status FROM public.talkx_recipients WHERE id='$r_failed2')")"
assert_eq '#124 3. campanha sending segue sem carimbo (nao houve novo lancamento)' '<nulo>' \
  "$(psql_val "SELECT COALESCE(consent_confirmed_by::text,'<nulo>') FROM public.talkx_campaigns WHERE id='$c_sending2'")"

# ── 3b) retry com confirmacao mas sem base legal -> recusado, sem escrever ────
g3b="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_reopen_no_legal', ARRAY['$r_reopen_no_legal']::uuid[], true)")"
assert_has '#124 3b. reabertura confirmada sem legal_basis -> erro' 'talkx_relaunch_confirmation_required' "$g3b"
assert_eq '#124 3b. sem legal_basis: campanha e destinatario intactos' 'completed|failed' \
  "$(psql_val "SELECT (SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen_no_legal') || '|' || (SELECT status FROM public.talkx_recipients WHERE id='$r_reopen_no_legal')")"
assert_eq '#124 3b. sem legal_basis: nenhum evento gravado' '0' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_reopen_no_legal'")"

# ── 4) resolve 'retry' em campanha completed: exige as DUAS confirmacoes ─────
g4="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown3','retry','confere',true)")"
assert_has '#124 4. retry de outcome_unknown sem p_confirm_relaunch -> erro' 'talkx_relaunch_confirmation_required' "$g4"
assert_eq '#124 4. nada escrito: destinatario segue outcome_unknown e campanha completed' 'outcome_unknown|completed' \
  "$(psql_val "SELECT (SELECT status FROM public.talkx_recipients WHERE id='$r_unknown3') || '|' || (SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen_unknown')")"
g4b="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown_empty_legal','retry','confere',true,true)")"
assert_has '#124 4b. retry de outcome_unknown com legal_basis vazio -> erro' 'talkx_relaunch_confirmation_required' "$g4b"
assert_eq '#124 4b. sem legal_basis: destinatario e campanha intactos' 'outcome_unknown|completed' \
  "$(psql_val "SELECT (SELECT status FROM public.talkx_recipients WHERE id='$r_unknown_empty_legal') || '|' || (SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen_unknown_empty_legal')")"
g5="$(as_user "$user_admin" "SELECT public._x031_try_resolve('$r_unknown3','retry','confere',true,true)")"
assert_has '#124 4. com as duas confirmacoes e legal_basis -> OK' 'OK|' "$g5"
assert_eq '#124 4. campanha completed -> sending com o carimbo renovado' "sending|$profile_admin" \
  "$(psql_val "SELECT (SELECT status FROM public.talkx_campaigns WHERE id='$c_reopen_unknown') || '|' || (SELECT consent_confirmed_by::text FROM public.talkx_campaigns WHERE id='$c_reopen_unknown')")"

# ── 5) a assinatura antiga (sem a confirmacao) nao existe mais ───────────────
assert_eq '#124 5. retry_talkx_recipients(uuid,uuid[]) nao existe' '' \
  "$(psql_val "SELECT COALESCE(to_regprocedure('public.retry_talkx_recipients(uuid,uuid[])')::text,'')")"
assert_eq '#124 5. resolve_talkx_outcome_unknown(uuid,text,text,boolean) nao existe' '' \
  "$(psql_val "SELECT COALESCE(to_regprocedure('public.resolve_talkx_outcome_unknown(uuid,text,text,boolean)')::text,'')")"

# ── 6) ACL e search_path das assinaturas novas ───────────────────────────────
for fn in 'public.retry_talkx_recipients(uuid,uuid[],boolean)' \
          'public.resolve_talkx_outcome_unknown(uuid,text,text,boolean,boolean)'; do
  assert_eq "#124 6. authenticated com EXECUTE em $fn" 't' \
    "$(psql_val "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")"
  assert_eq "#124 6. anon sem EXECUTE em $fn" 'f' \
    "$(psql_val "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")"
  assert_eq "#124 6. search_path fixo em $fn" 'search_path=public, pg_temp' \
    "$(psql_val "SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = '$fn'::regprocedure")"
done

# ── 7) defesa em profundidade: o guard recusa reabertura sem base legal ──────
# campanha 'sending' volta a 'completed'; o UPDATE tenta renovar carimbo, mas sem legal_basis.
psql_exec >/dev/null <<SQL
UPDATE public.talkx_campaigns
   SET status = 'completed', completed_at = statement_timestamp(),
       consent_confirmed_by = '$profile_admin', consent_confirmed_at = statement_timestamp() - interval '1 day',
       legal_basis = NULL, updated_at = statement_timestamp()
 WHERE id = '$c_sending2';
SQL
guard124="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_admin';
SELECT set_config('app.talkx_retry_write','on',true);
UPDATE public.talkx_campaigns
   SET status='sending', consent_confirmed_by='$profile_admin', consent_confirmed_at=statement_timestamp()
 WHERE id='$c_sending2';
COMMIT;
SQL
)"
assert_has '#124 7. guard recusa reabrir sem legal_basis' 'talkx_relaunch_confirmation_required' "$guard124"
assert_eq '#124 7. campanha continua completed apos a recusa do guard' 'completed' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_sending2'")"

# ── 8) o contrato do #123 (validação do lote) continua valendo neste corpo ───
# (o #123 / R3-DELTA-004 recria esta RPC com versão ANTERIOR à minha: se a minha não
#  carregasse o delta dele, o CREATE OR REPLACE daqui desfaria a validação do lote)
id_inexistente_124='f0000000-0000-0000-0000-0000000012ff'
g6="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending2', ARRAY['$id_inexistente_124']::uuid[])")"
assert_has '#124 8. id inexistente -> talkx_retry_recipient_not_found (delta do #123 preservado)' 'P0002|talkx_retry_recipient_not_found' "$g6"
assert_eq '#124 8. lote inválido vem ANTES do gate: campanha completed intacta' 'completed' \
  "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='$c_sending2'")"
g7="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_sending2', ARRAY[NULL]::uuid[])")"
assert_has '#124 8. nulo no array -> invalid_talkx_retry_request (delta do #123 preservado)' '22023|invalid_talkx_retry_request' "$g7"

# ── 4) campanha completed sem carimbo/base legal nao reabre nem com confirmacao ──
out4="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_completed', ARRAY['$r_done']::uuid[], true)")"
assert_has '4. retry em campanha completed sem legal_basis -> erro' 'talkx_relaunch_confirmation_required' "$out4"
status4="$(psql_val "SELECT status || '|' || COALESCE(consent_confirmed_by::text,'<nulo>') || '|' || COALESCE(legal_basis,'<nulo>') FROM public.talkx_campaigns WHERE id='$c_completed'")"
assert_eq '4. campanha sem base legal continua completed e sem carimbo' 'completed|<nulo>|<nulo>' "$status4"
assert_eq '4. destinatario sem base legal continua failed' 'failed' \
  "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='$r_done'")"
ev4="$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_completed'")"
assert_eq '4. sem base legal: nenhum evento gerado' '0' "$ev4"

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

# ── 9) idempotência #124: reaplicar nao quebra e nao ressuscita a assinatura antiga ──
psql_exec < "$migration124" >/dev/null || fail 'migration #124 nao reaplicou (idempotencia)'
pass 'migration #124 reaplicada sem erro (idempotencia)'
assert_eq '9. assinatura antiga continua ausente apos reaplicar' '' \
  "$(psql_val "SELECT COALESCE(to_regprocedure('public.retry_talkx_recipients(uuid,uuid[])')::text,'')")"

# ── 10) o Rollback do cabeçalho da migration #124 é SQL executável e restaura o estado anterior ──
# As linhas '--   ...' logo após "-- Rollback (SQL executável" são o rollback; o fechar exige esse
# formato (SQL, não prosa) e aqui ele é EXECUTADO de verdade num banco descartável.
rollback_sql="$(awk '/^-- Rollback \(SQL/{f=1; next} f && /^--   /{sub(/^--   /,""); print; next} f{exit}' "$migration124")"
[[ -n "$rollback_sql" ]] || fail '#124 10. cabecalho da migration sem linhas de rollback executavel'
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by, failed_count,
                                    completed_at, consent_confirmed_by, consent_confirmed_at, legal_basis)
  VALUES ('$c_rollback', 'Concluida para o rollback', 'Oi', 'completed', '$profile_admin', 1,
          now() - interval '1 day', '$profile_admin', now() - interval '2 days', 'consent');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status)
  VALUES ('$r_rollback', '$c_rollback', '$contact_ok', 'failed');
SQL
printf '%s\n' "$rollback_sql" | psql_exec >/dev/null || fail '#124 10. o rollback do cabecalho nao executou'
pass '#124 10. rollback do cabecalho executado sem erro'
for fn in 'public.retry_talkx_recipients(uuid,uuid[],boolean)' \
          'public.resolve_talkx_outcome_unknown(uuid,text,text,boolean,boolean)'; do
  assert_eq "#124 10. assinatura nova some no rollback: $fn" '' \
    "$(psql_val "SELECT COALESCE(to_regprocedure('$fn')::text,'')")"
done
for fn in 'public.retry_talkx_recipients(uuid,uuid[])' \
          'public.resolve_talkx_outcome_unknown(uuid,text,text,boolean)'; do
  assert_eq "#124 10. assinatura antiga volta no rollback: $fn" "${fn#public.}" \
    "$(psql_val "SELECT COALESCE(to_regprocedure('$fn')::text,'')")"
  assert_eq "#124 10. ACL antiga restaurada (authenticated sim) em $fn" 't' \
    "$(psql_val "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")"
  assert_eq "#124 10. ACL antiga restaurada (anon nao) em $fn" 'f' \
    "$(psql_val "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")"
done
assert_eq '#124 10. guard volta ao corpo sem o ramo da reabertura confirmada' 'true' \
  "$(psql_val "SELECT (position('talkx_relaunch_confirmation_required' in prosrc) = 0)::text FROM pg_proc WHERE oid = 'public.enforce_talkx_campaign_mutability()'::regprocedure")"
assert_eq '#124 10. retry antigo mantem a validacao de lote do #123' 'true' \
  "$(psql_val "SELECT (position('talkx_retry_recipient_not_found' in prosrc) > 0)::text FROM pg_proc WHERE oid = 'public.retry_talkx_recipients(uuid,uuid[])'::regprocedure")"
rb="$(as_user "$user_admin" "SELECT public._x031_try_retry('$c_rollback', ARRAY['$r_rollback']::uuid[])")"
assert_has '#124 10. apos o rollback a reabertura volta a nao exigir confirmacao' 'OK|' "$rb"

# a migration reaplica por cima do rollback e o gate volta
psql_exec < "$migration124" >/dev/null || fail 'migration #124 nao reaplicou apos o rollback'
pass 'migration #124 reaplicada apos o rollback'
assert_eq '#124 10. assinatura nova volta apos reaplicar' 'retry_talkx_recipients(uuid,uuid[],boolean)' \
  "$(psql_val "SELECT COALESCE(to_regprocedure('public.retry_talkx_recipients(uuid,uuid[],boolean)')::text,'')")"
assert_eq '#124 10. assinatura antiga some apos reaplicar' '' \
  "$(psql_val "SELECT COALESCE(to_regprocedure('public.retry_talkx_recipients(uuid,uuid[])')::text,'')")"

echo '[OK] Talk X X031 + #124: reenvio manual em lote com teto de 3, revalidacao de supressao/elegibilidade, reabertura de campanha completed SOMENTE com nova confirmacao e legal_basis gravada (carimbo renovado e trilha), resolucao de outcome_unknown por RPC com trilha e gate de agente.'
echo '[OK] Talk X #123 (R3-DELTA-004): retry em lote so aceita ids que existem NA campanha — lote inexistente ou misto e recusado (talkx_retry_recipient_not_found), nulo no array e invalid_talkx_retry_request, campanha completed nao e mais reaberta sem destinatario.'
