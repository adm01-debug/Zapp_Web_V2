#!/usr/bin/env bash
# Harness descartável: V19 — retry manual de destinatário terminal.
# Prova: retry_talkx_recipient reabre failed/outcome_unknown para pending,
#        incrementa attempt_count e recusa quando attempt_count >= 3.
#
# Seção #300 (R2-DB-015, P2) — "o retry terminal pode voltar a pending SEM se
# tornar elegível ao worker":
#   RED (corpo vivo de 20260930630000): o retry devolve true, a linha fica
#     'pending' mas CONSERVA provider_dispatch_started_at e/ou a campanha continua
#     'completed'; o seletor real do motor (public.talkx_next_recipients) exige o
#     campo NULL e a campanha 'sending', então devolve ZERO linhas — o destinatário
#     fica pendurado depois de um sucesso anunciado.
#   GREEN (migration de correção, marcador 'talkx_retry_terminal_elegivel'):
#     - failed pós-POST -> pending com provider_dispatch_started_at NULO,
#       retry_after preenchido, failed_count -1 e campanha 'completed' reaberta para
#       'sending' (completed_at NULL, evento 'resumed');
#     - o mesmo destinatário APARECE em talkx_next_recipients (elegível de verdade);
#     - outcome_unknown não é reaberto por aqui: erro explícito
#       'talkx_outcome_unknown_requires_reconciliation' (a decisão é da RPC X031
#       resolve_talkx_outcome_unknown, com confirmação de risco de duplicidade);
#     - campanha 'cancelled' -> false sem tocar na linha; teto de 3 e 'sent'
#       continuam recusados; authenticated -> 42501.
#
# A migration é encontrada pelo marcador interno 'talkx_retry_terminal_elegivel'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/r2-db-015.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lease_migration="$repo_root/supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql"
v19_migration="$repo_root/supabase/migrations/20260930630000_talkx_v19_retry_recipient.sql"

migration="$(grep -rlF 'talkx_retry_terminal_elegivel' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/r2-db-015.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration de correção não encontrada (marcador talkx_retry_terminal_elegivel)\n' >&2; exit 1; }
[[ -f "$lease_migration" ]] || { printf '[FALHA] migration do seletor do motor ausente: %s\n' "$lease_migration" >&2; exit 1; }
[[ -f "$v19_migration" ]] || { printf '[FALHA] migration V19 do retry ausente: %s\n' "$v19_migration" >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

test_password='talkx_v19_test_only'
cid="talkx-v19-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v19-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Roda uma chamada como service_role (o papel que a edge usa) e devolve o valor.
as_service() {
  psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; $1; COMMIT;"
}

# Espera erro com a marca pedida e um status != 0.
expect_error() {
  local label="$1" needle="$2" sql="$3" out status
  set +e
  out="$(psql_test -Atq -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; $sql; COMMIT;" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

-- Espelho mínimo das tabelas vivas que o retry e o seletor do motor tocam.
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  message_template text NOT NULL DEFAULT '',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  media_url text,
  scheduled_at timestamptz,
  created_by uuid,
  started_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  error_message text,
  provider_dispatch_started_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  delivery_last_claim_token uuid,
  delivery_attempt_count integer NOT NULL DEFAULT 0,
  manual_retry_count smallint NOT NULL DEFAULT 0,
  personalized_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, name text, nickname text, phone text, company text);
-- CHECK de tipo de evento igual ao da tabela viva (20260908120000).
CREATE TABLE public.talkx_campaign_events (
  campaign_id uuid,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  CONSTRAINT talkx_campaign_events_type_check CHECK (
    event_type IN ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note')
  )
);
-- Stub fiel do Vault (a migration do seletor cria talkx_cron_secret).
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

INSERT INTO public.contacts (id, name, nickname, phone, company) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Ana', 'Aninha', '5511990000001', 'ACME');

-- Campanhas: uma terminal (completed) e as demais ativas/terminais do cenário.
INSERT INTO public.talkx_campaigns (id, status, message_template, total_recipients, failed_count, completed_at) VALUES
  ('40000000-0000-0000-0000-0000000000c1', 'completed', 'Olá', 1, 1, statement_timestamp() - interval '2 hours'),
  ('40000000-0000-0000-0000-0000000000c2', 'completed', 'Olá', 1, 1, statement_timestamp() - interval '2 hours'),
  ('40000000-0000-0000-0000-0000000000a1', 'sending',   'Olá', 4, 0, NULL),
  ('40000000-0000-0000-0000-0000000000a2', 'paused',    'Olá', 1, 0, NULL),
  ('40000000-0000-0000-0000-0000000000a3', 'cancelled', 'Olá', 1, 0, NULL);

-- Conjunto RED (corpo vivo de 20260930630000) e conjunto GREEN (migration nova):
-- mesmas formas, ids distintos, para nenhum bloco depender do estado do outro.
INSERT INTO public.talkx_recipients
  (id, campaign_id, contact_id, status, attempt_count, error_message, provider_dispatch_started_at,
   delivery_claim_token, delivery_claimed_at, delivery_claim_expires_at, delivery_claimed_by, delivery_last_claim_token)
VALUES
  -- RED: failed pós-POST numa campanha terminal.
  ('10000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000001',
   'failed', 1, 'Erro 400 do provedor', statement_timestamp() - interval '1 hour',
   gen_random_uuid(), statement_timestamp() - interval '1 hour', statement_timestamp() - interval '30 minutes', 'worker-1', gen_random_uuid()),
  -- RED: outcome_unknown numa campanha ativa.
  ('10000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001',
   'outcome_unknown', 1, 'Provider outcome unknown', statement_timestamp() - interval '1 hour',
   gen_random_uuid(), statement_timestamp() - interval '1 hour', statement_timestamp() - interval '30 minutes', 'worker-1', gen_random_uuid()),
  -- GREEN: failed pós-POST numa campanha terminal (o caso da auditoria).
  ('10000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-000000000001',
   'failed', 1, 'Erro 400 do provedor', statement_timestamp() - interval '1 hour',
   gen_random_uuid(), statement_timestamp() - interval '1 hour', statement_timestamp() - interval '30 minutes', 'worker-1', gen_random_uuid()),
  -- GREEN: failed antes do POST (falha de progresso) numa campanha ativa.
  ('10000000-0000-0000-0000-0000000000b2', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001',
   'failed', 0, 'sem conexao', NULL, NULL, NULL, NULL, NULL, NULL),
  -- GREEN: outcome_unknown (ambíguo) numa campanha ativa.
  ('10000000-0000-0000-0000-0000000000b3', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001',
   'outcome_unknown', 1, 'Provider outcome unknown', statement_timestamp() - interval '1 hour',
   gen_random_uuid(), statement_timestamp() - interval '1 hour', statement_timestamp() - interval '30 minutes', 'worker-1', gen_random_uuid()),
  -- GREEN: teto de tentativas, campanha cancelada e linha não terminal.
  ('10000000-0000-0000-0000-0000000000b4', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001',
   'failed', 3, 'Erro 400 do provedor', statement_timestamp() - interval '1 hour', NULL, NULL, NULL, NULL, NULL),
  ('10000000-0000-0000-0000-0000000000b5', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'failed', 1, 'Erro 400 do provedor', statement_timestamp() - interval '1 hour', NULL, NULL, NULL, NULL, NULL),
  ('10000000-0000-0000-0000-0000000000b6', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001',
   'sent', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  -- GREEN: failed numa campanha PAUSADA (retry é válido; o motor volta a pegar ao retomar).
  ('10000000-0000-0000-0000-0000000000b7', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'failed', 1, 'Erro 400 do provedor', statement_timestamp() - interval '1 hour', NULL, NULL, NULL, NULL, NULL);
SQL

# ---------------------------------------------------------------------------
# Base real: seletor do motor (talkx_next_recipients + guard das campanhas) e o
# corpo VIVO do retry V19 — sem ele não há defeito para reproduzir.
# ---------------------------------------------------------------------------
psql_test < "$lease_migration" >/dev/null || fail 'migration do seletor do motor (20261001311230) nao aplicou'
psql_test < "$v19_migration" >/dev/null || fail 'migration V19 (20260930630000) nao aplicou'

eligible_sql() {  # campanha + destinatário -> n (linhas que o motor listaria para ele)
  as_service "SELECT count(*) FROM public.talkx_next_recipients('$1', 20) WHERE recipient_id = '$2'"
}

# ---------------------------------------------------------------------------
# RED — o defeito auditado: retry aceito (true) e a linha NÃO elegível ao motor.
# ---------------------------------------------------------------------------
red_failed="$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000a1');")"
[[ "$red_failed" == 't' ]] || fail "RED: retry do failed deveria devolver true (got $red_failed)"
red_mark="$(psql_val "SELECT COALESCE(provider_dispatch_started_at::text, 'NULL') FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000a1'")"
[[ "$red_mark" != 'NULL' ]] || fail 'RED: esperava a marca de POST PRESERVADA (o defeito) e veio NULL'
red_status="$(psql_val "SELECT status || ':' || (SELECT status FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-0000000000c1') FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000a1'")"
[[ "$red_status" == 'pending:completed' ]] || fail "RED: linha pending em campanha terminal (got $red_status)"
[[ "$(eligible_sql '40000000-0000-0000-0000-0000000000c1' '10000000-0000-0000-0000-0000000000a1')" == '0' ]] \
  || fail 'RED: o motor NAO deveria listar uma pending com a marca de POST preservada'
red_unknown="$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000a2');")"
[[ "$red_unknown" == 't' ]] || fail "RED: retry do outcome_unknown devolvia true (o sucesso falso) — got $red_unknown"
[[ "$(eligible_sql '40000000-0000-0000-0000-0000000000a1' '10000000-0000-0000-0000-0000000000a2')" == '0' ]] \
  || fail 'RED: o motor NAO deveria listar o outcome_unknown reaberto sem reconciliacao'
pass 'RED: retry devolvia true e deixava a linha pendurada (pending sem elegibilidade)'

# ---------------------------------------------------------------------------
# GREEN — migration de correção aplicada sobre o mesmo banco.
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'migration de correção nao aplicou (GREEN)'

# (1) failed pós-POST em campanha terminal -> pending ELEGÍVEL e campanha reaberta.
retry_post="$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b1');")"
[[ "$retry_post" == 't' ]] || fail "GREEN: retry do failed pos-POST deveria devolver true (got $retry_post)"
[[ "$(psql_val "SELECT COALESCE(provider_dispatch_started_at::text,'NULL') FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b1'")" == 'NULL' ]] \
  || fail 'GREEN: failed pos-POST deveria perder a marca de POST (provider_dispatch_started_at NULL)'
[[ "$(psql_val "SELECT COALESCE(retry_after::text,'NULL') <> 'NULL' FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b1'")" == 't' ]] \
  || fail 'GREEN: failed pos-POST deveria sair com retry_after preenchido'
[[ "$(psql_val "SELECT attempt_count || '|' || COALESCE(error_message,'NULL') FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b1'")" == '2|NULL' ]] \
  || fail 'GREEN: failed pos-POST deveria ficar com attempt_count=2 e erro limpo'
campaign_after="$(psql_val "SELECT status || '|' || failed_count || '|' || COALESCE(completed_at::text,'NULL') FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-0000000000c2'")"
[[ "$campaign_after" == 'sending|0|NULL' ]] || fail "GREEN: campanha completed deveria reabrir para sending com failed_count 0 (got $campaign_after)"
[[ "$(eligible_sql '40000000-0000-0000-0000-0000000000c2' '10000000-0000-0000-0000-0000000000b1')" == '1' ]] \
  || fail 'GREEN: o retry aceito precisa APARECER em talkx_next_recipients'
[[ "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='40000000-0000-0000-0000-0000000000c2' AND event_type='resumed'")" == '1' ]] \
  || fail 'GREEN: reabertura deveria gravar o evento resumed'
[[ "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='40000000-0000-0000-0000-0000000000c2' AND event_type='note' AND message LIKE '%previous_provider_dispatch_started_at%'")" == '1' ]] \
  || fail 'GREEN: o retry deveria deixar evento com a trilha do estado anterior'
pass '(1) failed pos-POST: pending elegivel, failed_count -1, campanha reaberta com evento'

# (2) failed antes do POST (campanha ativa) continua funcionando.
retry_pre="$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b2');")"
[[ "$retry_pre" == 't' ]] || fail "GREEN: retry do failed pre-POST deveria devolver true (got $retry_pre)"
[[ "$(psql_val "SELECT status || ':' || attempt_count FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b2'")" == 'pending:1' ]] \
  || fail 'GREEN: failed pre-POST deveria virar pending:1'
[[ "$(eligible_sql '40000000-0000-0000-0000-0000000000a1' '10000000-0000-0000-0000-0000000000b2')" == '1' ]] \
  || fail 'GREEN: failed pre-POST reaberto precisa ser elegivel'
pass '(2) failed pre-POST: pending elegivel no caminho ativo'

# (3) outcome_unknown: recusa explicita (aguarda reconciliação), sem tocar a linha.
expect_error 'GREEN (3) outcome_unknown -> requires_reconciliation' 'talkx_outcome_unknown_requires_reconciliation' \
  "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b3');"
[[ "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b3'")" == 'outcome_unknown' ]] \
  || fail 'GREEN: outcome_unknown nao pode ser alterado por este caminho'
[[ "$(psql_val "SELECT COALESCE(provider_dispatch_started_at::text,'NULL') <> 'NULL' FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b3'")" == 't' ]] \
  || fail 'GREEN: a recusa do outcome_unknown nao pode limpar a marca de POST'
[[ "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE message LIKE '%10000000-0000-0000-0000-0000000000b3%'")" == '0' ]] \
  || fail 'GREEN: a recusa do outcome_unknown nao pode gravar evento'

# (4) recusas: id inexistente, teto de tentativas, linha nao terminal, campanha cancelada.
[[ "$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000ff');")" == 'f' ]] \
  || fail 'GREEN: id inexistente deveria devolver false'
[[ "$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b4');")" == 'f' ]] \
  || fail 'GREEN: attempt_count=3 deveria devolver false'
[[ "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b4'")" == 'failed' ]] \
  || fail 'GREEN: o teto nao pode reabrir a linha'
[[ "$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b6');")" == 'f' ]] \
  || fail 'GREEN: destinatario sent nao e terminal para retry'
[[ "$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b5');")" == 'f' ]] \
  || fail 'GREEN: campanha cancelada nunca pode gerar um pending sem motor'
[[ "$(psql_val "SELECT status FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-0000000000b5'")" == 'failed' ]] \
  || fail 'GREEN: a recusa da campanha cancelada nao pode alterar a linha'
pass '(4) id inexistente, teto, sent e campanha cancelada recusados sem efeito'

# (5) campanha pausada: retry aceito, estado da campanha intacto.
retry_paused="$(as_service "SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b7');")"
[[ "$retry_paused" == 't' ]] || fail "GREEN: retry em campanha pausada deveria devolver true (got $retry_paused)"
[[ "$(psql_val "SELECT status FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-0000000000a2'")" == 'paused' ]] \
  || fail 'GREEN: campanha pausada nao pode mudar de status por um retry'
pass '(5) campanha pausada: retry aceito sem mudar o status da campanha'

# (6) portao de papel: so service_role executa; authenticated cai na checagem da RPC.
[[ "$(psql_val "SELECT has_function_privilege('service_role', 'public.retry_talkx_recipient(uuid)', 'EXECUTE')")" == 't' ]] \
  || fail 'GREEN: service_role precisa de EXECUTE'
for papel in anon authenticated; do
  [[ "$(psql_val "SELECT has_function_privilege('$papel', 'public.retry_talkx_recipient(uuid)', 'EXECUTE')")" == 'f' ]] \
    || fail "GREEN: $papel nao pode ter EXECUTE"
done
expect_error 'GREEN (6) authenticated -> 42501 service_role_required' 'service_role_required' \
  "SET LOCAL request.jwt.claim.role='authenticated'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-0000000000b4');"
pass '(6) ACL: anon/authenticated sem EXECUTE; papel errado -> service_role_required'

echo '[OK] Talk X V19/R2-DB-015: retry terminal devolve pending ELEGIVEL ao motor (failed), reabre campanha terminal e recusa outcome_unknown/campanha cancelada.'
