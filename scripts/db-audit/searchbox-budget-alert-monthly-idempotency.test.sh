#!/usr/bin/env bash
# R2-API-058 / #230 (P2, area banco): "Alerta mensal de custo repete e-mail em cada
# execucao diaria do cron".
#
# O job do cron `searchbox-budget-alert` (migration REAL 20261002601230) rodava, todo dia,
# DUAS instrucoes: SELECT public.notify_searchbox_budget()  (canal app, com ledger mensal em
# notifications) e SELECT net.http_post(...searchbox-budget-alert...) INCONDICIONAL. A edge so
# consulta o consumo e envia: enquanto o mes ficasse acima do limiar, o e-mail repetia em CADA
# execucao diaria -- um alerta por dia em vez de um por mes.
#
# Este contrato roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A -- estado ANTERIOR (defeito): aplica a migration real 20261002601230 e executa o
#              comando REAL do cron.job duas vezes no mesmo mes. O canal app deduplica (1
#              notificacao), mas saem DOIS net.http_post -> o defeito, medido no POST que o
#              cron faria de verdade.
#   BLOCO B -- migration nova aplicada (20261006235031): o mes e reivindicado de forma atomica
#              no ledger proprio do canal de e-mail (public.searchbox_budget_alert_emails, PK=mes)
#              ANTES do envio; so o mes novo (ou um mes com falha CONFIRMADA) faz o POST. Dois
#              ticks do mesmo mes = UM POST. status 'sent'/'pending'/'uncertain' nao reenviam.
#   BLOCO C -- rollback: as linhas `-- Rollback:` da migration sao extraidas e EXECUTADAS; o
#              job volta ao comando anterior (guardado como dado pela propria migration), o
#              ledger, a tabela de estado e a funcao nova somem -- e o defeito volta a acontecer
#              (2 POSTs), provando que o rollback desfaz o que a migration fez.
#
# Nao ha host literal em nenhum lugar deste contrato: a URL do canal e CAPTURADA do comando
# vigente do job, exatamente como a migration nova faz (a trava do modo V2 proibe o host no SQL).
#
# LIMITE DECLARADO: o container nao tem o Vault nem o pg_cron do Supabase. O pre.sql cria STUBS
# fieis: cron.job + cron.schedule/unschedule (com o UPSERT por (jobname, username) do pg_cron 1.6),
# Vault (vault.decrypted_secrets) e net.http_post trocado por uma TABELA DE CAPTURA -- o teste
# mede os POSTs que o cron dispararia, sem rede. As funcoes e o SQL sob prova vem dos ARQUIVOS de
# supabase/migrations/ (nada de policy/ledger recriado a mao no teste).
#
# Uso: bash scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh
#      SEARCHBOX_ALERT_TEST_POSTGRES_IMAGE=postgres:17-alpine (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${MIGRATIONS_DIR:-}" ]]; then
  migrations_dir="$MIGRATIONS_DIR"
elif [[ -d "$repo_root/supabase/migrations" ]]; then
  migrations_dir="$repo_root/supabase/migrations"
else
  migrations_dir="${ZAPP_REPO_ROOT:-$HOME/projetos/Zapp_Web_V2}/supabase/migrations"
fi
migration_antiga="$migrations_dir/20261002601230_searchbox_budget_alert_cron.sql"
migration_nova="$migrations_dir/20261006235031_searchbox_budget_alert_email_ledger.sql"
postgres_image="${SEARCHBOX_ALERT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-searchbox-alert-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-searchbox-alert-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
# Roda como o PAPEL REAL (nunca como postgres): e o unico jeito de provar ACL/RLS.
as_role() {
  local papel="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $papel; $sql"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}
expect_error_as() {
  local label="$1" needle="$2" papel="$3" sql="$4" out st
  set +e; out="$(as_role "$papel" "$sql" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}
expect_value_as() {
  local label="$1" expected="$2" papel="$3" sql="$4" actual
  actual="$(as_role "$papel" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}

# Executa o comando REAL do cron.job -- nao uma reimplementacao do que o job faz.
tick() {
  local cmd
  cmd="$(psql_sql "SELECT command FROM cron.job WHERE jobname = 'searchbox-budget-alert'")"
  [[ -n "$cmd" ]] || fail 'job searchbox-budget-alert nao existe'
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$cmd" >/dev/null
}
SQL_CAPTURAS='SELECT count(*) FROM net.http_capture'
SQL_NOTIF="SELECT count(*) FROM public.notifications WHERE type = 'searchbox_budget_alert'"
reset_medicao() { psql_sql 'TRUNCATE net.http_capture'; psql_sql 'DELETE FROM public.notifications'; }
MES="to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM')"
LEDGER='public.searchbox_budget_alert_emails'

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_antiga" ]] || fail "migration nao encontrada: $migration_antiga"
[[ -f "$migration_nova" ]] || fail "migration nao encontrada: $migration_nova"

printf '== container: %s (imagem %s)\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

mkdir -p "${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
-- ── roles do PostgREST (idempotente) ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- ── tabelas minimas que as funcoes REAIS tocam ───────────────────────────────
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text
);
CREATE TABLE public.notifications (
  id bigserial PRIMARY KEY,
  user_id uuid,
  title text,
  message text,
  type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.searchbox_usage_daily (
  dia date PRIMARY KEY,
  sessoes integer NOT NULL DEFAULT 0
);

-- ── Vault (stub): a subquery do segredo de cron do job ───────────────────────
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;

-- ── net.http_post trocado por TABELA DE CAPTURA: mede os POSTs, sem rede ─────
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE net.http_capture (
  id bigserial PRIMARY KEY,
  url text,
  body jsonb,
  headers jsonb,
  timeout_milliseconds integer,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE OR REPLACE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE sql VOLATILE AS $$
  INSERT INTO net.http_capture (url, body, headers, timeout_milliseconds)
  VALUES (url, body, headers, timeout_milliseconds)
  RETURNING id
$$;

-- ── pg_cron (stub FIEL ao 1.6): schedule FAZ UPSERT por (jobname, username) ──
-- E exatamente o comportamento em que a migration nova se apoia (job de mesmo nome e
-- ATUALIZADO, nao duplicado) -- se o stub nao upsertasse, o teste mentiria.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT current_user,
  CONSTRAINT cron_job_jobname_username_key UNIQUE (jobname, username)
);
CREATE OR REPLACE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  SELECT jobid INTO v FROM cron.job WHERE jobname = p_name AND username = current_user;
  IF v IS NULL THEN
    INSERT INTO cron.job (jobname, schedule, command, username)
    VALUES (p_name, p_schedule, p_command, current_user)
    RETURNING jobid INTO v;
  ELSE
    UPDATE cron.job SET schedule = p_schedule, command = p_command WHERE jobid = v;
  END IF;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(p_name text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  DELETE FROM cron.job WHERE jobname = p_name AND username = current_user RETURNING true INTO v;
  RETURN COALESCE(v, false);
END $$;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO vault.secrets (name, description, secret) VALUES
  ('searchbox_alert_cron_secret', 'segredo de cron do alerta de custo do autocomplete', 'segredo-de-teste')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.profiles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'supervisor');

-- Mes corrente ACIMA do limiar (400). A dia e o 1o do mes, como a view real.
INSERT INTO public.searchbox_usage_daily (dia, sessoes)
VALUES (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date, 450);
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (o defeito) ============\n'
psql_file "$migration_antiga" >/dev/null

expect_value 'A1 o job do cron existe uma vez e com o comando ANTIGO (notify + POST incondicional)' 't' \
  "SELECT count(*) = 1
      AND bool_and(command LIKE '%notify_searchbox_budget%')
      AND bool_and(command LIKE '%net.http_post%')
     FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'A2 o horario do job segue 1x/dia as 12:00 UTC' 't' \
  "SELECT schedule = '0 12 * * *' FROM cron.job WHERE jobname = 'searchbox-budget-alert'"

tick
expect_value 'A3 1o dia do mes acima do limiar: 1 notificacao por destinatario (admin + supervisor)' '2' "$SQL_NOTIF"
expect_value 'A4 ...e o canal e-mail faz 1 POST' '1' "$SQL_CAPTURAS"

tick
expect_value 'A5 (DEFEITO) o canal app NAO repete: segue com as mesmas 2 notificacoes' '2' "$SQL_NOTIF"
expect_value 'A6 (DEFEITO) mas o e-mail REPETE no 2o dia: 2 POSTs no MESMO mes' '2' "$SQL_CAPTURAS"
expect_value 'A7 (DEFEITO) e a URL chamada e mesmo a edge do alerta mensal' '2' \
  "SELECT count(*) FROM net.http_capture WHERE url LIKE '%/functions/v1/searchbox-budget-alert'"
expect_value 'A8 (DEFEITO) sem nenhum ledger do canal de e-mail: nada registra o envio' 'f' \
  "SELECT to_regclass('public.searchbox_budget_alert_emails') IS NOT NULL"

printf '\n============ BLOCO B — migration nova aplicada ============\n'
psql_file "$migration_nova" >/dev/null

expect_value 'B1 o job foi ATUALIZADO (nao duplicado): segue 1 job com esse nome' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'B2 o job passou a chamar o tick unico' 't' \
  "SELECT command LIKE '%public.searchbox_budget_alert_tick()%' AND command NOT LIKE '%net.http_post%'
     FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'B3 o horario foi preservado (0 12 * * *)' 't' \
  "SELECT schedule = '0 12 * * *' FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'B4 o ledger do canal de e-mail existe, com RLS ligada' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.searchbox_budget_alert_emails'::regclass"
expect_value 'B4b o canal guarda a URL capturada do job (nao ha host literal no arquivo da migration)' 't' \
  "SELECT count(*) = 1 AND bool_and(url LIKE '%/functions/v1/searchbox-budget-alert')
     FROM public.searchbox_budget_alert_cron"
expect_value 'B4c e guarda o comando ANTERIOR do job, para o rollback restaurar exatamente' 't' \
  "SELECT bool_and(previous_command LIKE '%notify_searchbox_budget%')
      AND bool_and(previous_command LIKE '%net.http_post%')
     FROM public.searchbox_budget_alert_cron WHERE id"
expect_value 'B4d a tabela de estado do canal tem RLS ligada' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.searchbox_budget_alert_cron'::regclass"

reset_medicao
expect_value 'B5 controle: medicao zerada antes do cenario' '0' "$SQL_CAPTURAS"

# ── abaixo do limiar: nem notificacao, nem POST, nem linha no ledger ──────────
psql_sql "UPDATE public.searchbox_usage_daily SET sessoes = 100" >/dev/null
tick
expect_value 'B6 abaixo de 400: 0 POST' '0' "$SQL_CAPTURAS"
expect_value 'B7 abaixo de 400: nenhuma linha reivindicada no ledger' '0' \
  "SELECT count(*) FROM public.searchbox_budget_alert_emails"

# ── mes novo acima do limiar: reivindica UMA vez e envia UMA vez ──────────────
psql_sql "UPDATE public.searchbox_usage_daily SET sessoes = 450" >/dev/null
tick
expect_value 'B8 1o dia acima do limiar: 1 POST' '1' "$SQL_CAPTURAS"
expect_value 'B9 1o dia acima do limiar: 1 notificacao por destinatario (admin + supervisor)' '2' "$SQL_NOTIF"
expect_value 'B10 o mes ficou reivindicado no ledger, status pending' 'pending' \
  "SELECT status FROM $LEDGER WHERE mes = $MES"
expect_value 'B11 e a tentativa foi contada (attempt_count = 1)' '1' \
  "SELECT attempt_count FROM $LEDGER WHERE mes = $MES"
expect_value 'B12 o request_id do pg_net ficou gravado (resultado conciliavel)' 't' \
  "SELECT request_id IS NOT NULL FROM $LEDGER WHERE mes = $MES"
expect_value 'B12b o POST do tick foi para a URL do canal (capturada do job, nao recriada)' '1' \
  "SELECT count(*) FROM net.http_capture WHERE url LIKE '%/functions/v1/searchbox-budget-alert'"
expect_value 'B12c e o POST carrega o x-cron-secret do Vault (falha fechada preservada)' 't' \
  "SELECT bool_and(headers->>'x-cron-secret' IS NOT NULL) FROM net.http_capture"

# ── O DEFEITO: o 2o dia do MESMO mes nao repete nada ─────────────────────────
tick
expect_value 'B13 (CORRECAO) 2o dia do mesmo mes: o e-mail NAO repete (1 POST no total)' '1' "$SQL_CAPTURAS"
expect_value 'B14 (CORRECAO) o app tambem segue com as mesmas 2 notificacoes' '2' "$SQL_NOTIF"

# ── falha CONFIRMADA libera nova tentativa (retry) ───────────────────────────
psql_sql "UPDATE $LEDGER SET status = 'failed' WHERE mes = $MES" >/dev/null
tick
expect_value 'B15 falha CONFIRMADA (status failed) permite retry: 2o POST' '2' "$SQL_CAPTURAS"
expect_value 'B16 e a tentativa foi contada (attempt_count = 2)' '2' \
  "SELECT attempt_count FROM $LEDGER WHERE mes = $MES"
expect_value 'B17 o retry volta a reivindicar (status pending de novo)' 'pending' \
  "SELECT status FROM $LEDGER WHERE mes = $MES"

# ── 'sent' / 'uncertain' nunca reenviam ──────────────────────────────────────
psql_sql "UPDATE $LEDGER SET status = 'sent' WHERE mes = $MES" >/dev/null
tick
expect_value 'B18 mes CONFIRMADO como enviado nao reenvia (2 POSTs, nao 3)' '2' "$SQL_CAPTURAS"

psql_sql "UPDATE $LEDGER SET status = 'uncertain' WHERE mes = $MES" >/dev/null
tick
expect_value 'B19 resultado INCERTO nao reenvia: conciliacao, nao duplicata (2 POSTs)' '2' "$SQL_CAPTURAS"

# ── a PK do mes e a trava: o mes nao duplica ─────────────────────────────────
expect_error_as 'B20 o MES e a identidade do incidente: 2a linha do mesmo mes e recusada pela PK' \
  'duplicate key value violates unique constraint' postgres \
  "INSERT INTO $LEDGER (mes, sessoes) VALUES ($MES, 1);"
expect_error_as 'B20b entrada invalida: mes fora do formato AAAA-MM e recusado pelo CHECK' \
  'violates check constraint' postgres \
  "INSERT INTO $LEDGER (mes, sessoes) VALUES ('2026-1', 1);"
expect_error_as 'B20c entrada invalida: status fora do vocabulario e recusado pelo CHECK' \
  'violates check constraint' postgres \
  "UPDATE $LEDGER SET status = 'enviado' WHERE mes = $MES;"

# ── ACL: ledger e funcao fechados para anon/authenticated ────────────────────
expect_error_as 'B21 authenticated nao LE o ledger' 'permission denied' authenticated \
  "SELECT count(*) FROM $LEDGER;"
expect_error_as 'B22 anon nao LE o ledger' 'permission denied' anon \
  "SELECT count(*) FROM $LEDGER;"
expect_error_as 'B23 authenticated nao EXECUTA o tick' 'permission denied' authenticated \
  "SELECT public.searchbox_budget_alert_tick();"
expect_error_as 'B24 anon nao EXECUTA o tick' 'permission denied' anon \
  "SELECT public.searchbox_budget_alert_tick();"
expect_value 'B25 nem a funcao nem o ledger concedem nada a PUBLIC' '0' \
  "SELECT (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
             WHERE p.proname = 'searchbox_budget_alert_tick' AND a.grantee = 0)
        + (SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a
             WHERE c.oid = 'public.searchbox_budget_alert_emails'::regclass AND a.grantee = 0)"
expect_value_as 'B26 service_role LE o ledger (e quem confirma o envio por ele)' '1' service_role \
  "SELECT count(*) FROM $LEDGER"
expect_value 'B27 has_table_privilege de service_role no ledger (SELECT)' 't' \
  "SELECT has_table_privilege('service_role', '$LEDGER', 'SELECT')"
expect_value 'B28 has_table_privilege de service_role no ledger (UPDATE)' 't' \
  "SELECT has_table_privilege('service_role', '$LEDGER', 'UPDATE')"
expect_error_as 'B29 authenticated nao LE a tabela de estado do canal' 'permission denied' authenticated \
  "SELECT count(*) FROM public.searchbox_budget_alert_cron;"
expect_error_as 'B30 anon nao LE a tabela de estado do canal' 'permission denied' anon \
  "SELECT count(*) FROM public.searchbox_budget_alert_cron;"

printf '\n============ BLOCO C — rollback executado ============\n'
grep '^-- Rollback: ' "$migration_nova" | sed 's/^-- Rollback: //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem linhas -- Rollback: executaveis'
psql_file "$tmp_dir/rollback.sql" >/dev/null

expect_value 'C1 o ledger foi removido pelo rollback' 'f' \
  "SELECT to_regclass('public.searchbox_budget_alert_emails') IS NOT NULL"
expect_value 'C2 a funcao nova foi removida' 'f' \
  "SELECT to_regprocedure('public.searchbox_budget_alert_tick()') IS NOT NULL"
expect_value 'C3 o job voltou ao comando ANTERIOR (notify + POST incondicional), sem duplicar' 't' \
  "SELECT count(*) = 1
      AND bool_and(command LIKE '%notify_searchbox_budget%')
      AND bool_and(command LIKE '%net.http_post%')
     FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'C4 e o horario segue 0 12 * * *' 't' \
  "SELECT schedule = '0 12 * * *' FROM cron.job WHERE jobname = 'searchbox-budget-alert'"
expect_value 'C5 a funcao antiga (canal app) continua viva e intacta' 't' \
  "SELECT to_regprocedure('public.notify_searchbox_budget()') IS NOT NULL"
expect_value 'C6 a tabela de estado do canal foi removida pelo rollback' 'f' \
  "SELECT to_regclass('public.searchbox_budget_alert_cron') IS NOT NULL"

reset_medicao
tick
tick
expect_value 'C7 comportamento anterior restaurado: o e-mail volta a repetir (2 POSTs)' '2' "$SQL_CAPTURAS"

printf '\nPASS: R2-API-058/#230 — o canal de e-mail do alerta mensal de custo tem identidade mensal\n'
printf 'e ledger proprio; dois ticks do mesmo mes fazem UM POST (o comando real do cron foi\n'
printf 'executado), falha confirmada retenta, resultado incerto nao duplica e o rollback devolve\n'
printf 'o job, a funcao e o estado anterior.\n'
