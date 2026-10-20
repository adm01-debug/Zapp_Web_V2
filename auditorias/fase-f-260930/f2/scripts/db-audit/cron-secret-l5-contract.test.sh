#!/usr/bin/env bash
# L5 da matriz docs/ia/IA-004-matriz-autorizacao.md: credencial DEDICADA de cron.
#
# Contrato A/B/C em PostgreSQL descartavel (docker), no mesmo formato dos testes
# irmaos scripts/db-audit/notify-due-tasks-authorization.test.sh (blocos A/B e
# helpers) e scripts/db-audit/retry-disposable-postgres-test.sh (bootstrap,
# container descartavel validado por regex antes do docker rm -f).
#
# Defeito (BLOCO A): os dois jobs do pg_cron autenticavam nas edges com a ANON KEY
#   do projeto -- header Authorization: Bearer <vault.zapp_anon_key>. A anon key e
#   credencial publica (vai no bundle do front): o cron nao tinha credencial de
#   maquina nenhuma.
#
# BLOCO B (02/10 na ordem): depois de 20260930240000_cron_secret_dedicado_l5, os
#   dois segredos dedicados existem (32 bytes gerados DENTRO do banco, hex), as
#   duas RPCs SECURITY DEFINER com search_path fixo devolvem o valor EXATO do
#   segredo de cada uma, EXECUTE esta fechado para PUBLIC/anon/authenticated e
#   aberto so para service_role. Depois de 20260930250000_reschedule_cron_secrets_l5
#   os dois jobs seguem com o schedule original, NAO mandam mais Bearer, mandam
#   x-cron-secret lido por subquery do Vault -- e reaplicar a migration nao
#   duplica job (unschedule antes de schedule).
#
# BLOCO C (mutacao): removido o REVOKE de uma COPIA temporaria da migration (o
#   arquivo do repo NAO e editado -- o proprio teste confere isso), num banco
#   limpo, a assercao de ACL FALHA e o vazamento do segredo volta para a anon.
#
# LIMITE DECLARADO: o container NAO tem o Vault nem o pg_cron do Supabase. O
# pre.sql cria STUBS minimos (tabela/view/rotinas) apenas para as DUAS migrations
# aplicarem sem erro. O que este contrato prova e o que as migrations fazem sobre
# essa superficie (criacao dos segredos, corpo das RPCs, ACL, texto dos jobs), nao
# o comportamento interno do Vault real -- exceto gen_random_bytes, que e o
# pgcrypto de verdade.
#
# Uso:
#   MIGRATIONS_DIR=/caminho/para/supabase/migrations \
#     bash scripts/db-audit/cron-secret-l5-contract.test.sh
#   CRON_SECRET_L5_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# O destino final deste arquivo e scripts/db-audit/ dentro do repo; rodando de
# fora (validacao) o caminho das migrations vem por MIGRATIONS_DIR.
if [[ -n "${MIGRATIONS_DIR:-}" ]]; then
  migrations_dir="$MIGRATIONS_DIR"
elif [[ -d "$repo_root/supabase/migrations" ]]; then
  migrations_dir="$repo_root/supabase/migrations"
else
  migrations_dir="${ZAPP_REPO_ROOT:-$HOME/projetos/Zapp_Web_V2}/supabase/migrations"
fi
migration_secrets="$migrations_dir/20260930240000_cron_secret_dedicado_l5.sql"
migration_reschedule="$migrations_dir/20260930250000_reschedule_cron_secrets_l5.sql"
postgres_image="${CRON_SECRET_L5_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-cron-secret-l5-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-cron-secret-l5-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_db() {
  local db="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" -c "$sql"
}
psql_sql() { psql_db postgres "$1"; }
psql_file_db() {
  local db="$1" file="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$file"
}
psql_file() { psql_file_db postgres "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value_db() {
  local label="$1" expected="$2" sql="$3" db="$4" actual
  actual="$(psql_db "$db" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_secrets" ]] || fail "migration nao encontrada: $migration_secrets"
[[ -f "$migration_reschedule" ]] || fail "migration nao encontrada: $migration_reschedule"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# TMPDIR do ambiente de tarefa aponta para um diretorio proprio que pode nao existir
# quando o teste comeca (mktemp nao cria o pai) -- garante antes de usar.
mkdir -p "${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── pre.sql: STUBS da infra do Supabase (Vault, pg_cron, roles do PostgREST) ────
# NAO sao as extensoes reais: sao o minimo para as duas migrations aplicarem.
# As rotinas usam os MESMOS nomes/assinaturas que as migrations chamam.
cat > "$tmp_dir/pre.sql" <<'SQL'
-- gen_random_bytes(32) e chamado como extensions.gen_random_bytes: no Supabase o
-- pgcrypto mora no schema extensions. Aqui o pgcrypto e real, no schema extensions.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(len integer) RETURNS bytea
  LANGUAGE sql AS $$ SELECT public.gen_random_bytes(len) $$;

-- ── Vault (stub) ───────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text DEFAULT NULL)
  RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (new_name, new_secret, new_description)
    RETURNING id $$;

-- ── pg_cron (stub) ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  RETURNING jobid INTO v;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
  RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobid = job_id RETURNING true $$;

-- ── roles do PostgREST (idempotente: o pre.sql roda em mais de um banco) ───────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
SQL

# ── seed.sql: o estado de PRODUCAO ANTES da tarefa (o defeito) ─────────────────
# Texto do command copiado do recon de producao (l5/db-recon.txt, jobid 12 e 8):
# os dois jobs mandam `Authorization: Bearer` + a anon key lida do Vault.
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO vault.secrets (name, description, secret)
VALUES ('zapp_anon_key', 'anon key do projeto (publica)', 'anon-key-publica-do-projeto')
ON CONFLICT (name) DO NOTHING;

DELETE FROM cron.job;
INSERT INTO cron.job (jobname, schedule, command) VALUES
('connection-health-check', '*/5 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $cmd$),
('avatars-refresh', '0 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$);
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

RPC_HEALTH='public.get_connection_health_check_cron_secret()'
RPC_AVATARS='public.get_avatars_refresh_cron_secret()'
RPC_COUNT="SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('get_connection_health_check_cron_secret','get_avatars_refresh_cron_secret')"

echo '── BLOCO A: ANTES da migration (o defeito) ────────────────────────────────────────'

expect_value 'A1 as duas RPCs de segredo dedicado ainda nao existem' '0' "$RPC_COUNT"
expect_value 'A2 nenhum segredo *_cron_secret esta no Vault (o defeito nao criou credencial de maquina)' '0' \
  "SELECT count(*) FROM vault.secrets WHERE name LIKE '%\_cron_secret'"
expect_value 'A3 o unico segredo de cron vivo e a anon key publica' '1' \
  "SELECT count(*) FROM vault.secrets WHERE name = 'zapp_anon_key'"
expect_value 'A4 os dois jobs mandam Bearer (a anon key) em vez de x-cron-secret' '2' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%Bearer%' AND command NOT LIKE '%x-cron-secret%'"
expect_value 'A5 e o Bearer sai do Vault na chave zapp_anon_key (credencial publica)' '2' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%zapp_anon_key%'"

echo
echo '── BLOCO B: aplicando 20260930240000 (segredos + RPCs) ─────────────────────────────'
psql_file "$migration_secrets"

expect_value 'B1 as duas RPCs existem em public' '2' "$RPC_COUNT"
expect_value 'B2 as duas sao SECURITY DEFINER com search_path fixo em public' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'get\_%\_cron_secret'
       AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public%'"
expect_value 'B3 os dois segredos dedicados existem no Vault (>0 caracteres)' '2' \
  "SELECT count(*) FROM vault.secrets WHERE name IN ('connection_health_check_cron_secret','avatars_refresh_cron_secret')
     AND length(secret) > 0"
expect_value 'B4 a RPC do health check devolve exatamente o segredo gravado' 't' \
  "SELECT $RPC_HEALTH = (SELECT secret FROM vault.secrets WHERE name = 'connection_health_check_cron_secret')"
expect_value 'B5 a RPC do avatars refresh devolve exatamente o segredo gravado' 't' \
  "SELECT $RPC_AVATARS = (SELECT secret FROM vault.secrets WHERE name = 'avatars_refresh_cron_secret')"
expect_value 'B6 os dois segredos dedicados sao distintos entre si (nao um copiado do outro)' 't' \
  "SELECT $RPC_HEALTH <> $RPC_AVATARS"
expect_value 'B7 o segredo nasceu in-db: 32 bytes em hex (64 chars hexadecimais)' 't' \
  "SELECT ($RPC_HEALTH ~ '^[0-9a-f]{64}$') AND ($RPC_AVATARS ~ '^[0-9a-f]{64}$')"
expect_value 'B8 anon NAO tem EXECUTE na RPC do health check' 'f' \
  "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')"
expect_value 'B9 anon NAO tem EXECUTE na RPC do avatars refresh' 'f' \
  "SELECT has_function_privilege('anon','$RPC_AVATARS','EXECUTE')"
expect_value 'B10 authenticated NAO tem EXECUTE em nenhuma das duas' '0' \
  "SELECT count(*) FROM (VALUES ('$RPC_HEALTH'),('$RPC_AVATARS')) v(f)
     WHERE has_function_privilege('authenticated', v.f, 'EXECUTE')"
expect_value 'B11 PUBLIC (grantee 0) ficou sem EXECUTE nas duas (o REVOKE e a parte que carrega)' '0' \
  "SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.proname LIKE 'get\_%\_cron_secret' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'"
expect_value 'B12 service_role tem EXECUTE nas duas' '2' \
  "SELECT count(*) FROM (VALUES ('$RPC_HEALTH'),('$RPC_AVATARS')) v(f)
     WHERE has_function_privilege('service_role', v.f, 'EXECUTE')"
expect_error 'B13 anon recebe permission denied ao CHAMAR a RPC (ACL imposta, nao so catalogo)' \
  'permission denied for function' \
  "SET ROLE anon; SELECT public.get_connection_health_check_cron_secret();"
expect_value 'B14 service_role (a edge) le o segredo pelo gateway' 't' \
  "SET ROLE service_role; SELECT public.get_avatars_refresh_cron_secret() IS NOT NULL"
expect_value 'B15 a migration dos segredos NAO muda job nenhum: Bearer intacto nos dois' '2' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%Bearer%'"

echo
echo '── BLOCO B: aplicando 20260930250000 (reagendamento dos jobs) ──────────────────────'
psql_file "$migration_reschedule"

expect_value 'B16 os dois jobs existem, um de cada nome' '2' \
  "SELECT count(*) FROM cron.job WHERE jobname IN ('connection-health-check','avatars-refresh')"
expect_value 'B17 o schedule original foi preservado (health: */5 * * * *)' 't' \
  "SELECT schedule = '*/5 * * * *' FROM cron.job WHERE jobname = 'connection-health-check'"
expect_value 'B18 o schedule original foi preservado (avatars: 0 * * * *)' 't' \
  "SELECT schedule = '0 * * * *' FROM cron.job WHERE jobname = 'avatars-refresh'"
expect_value 'B19 nenhum job manda mais Bearer' '0' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%Bearer%'"
expect_value 'B20 nenhum job carrega a anon key do projeto' '0' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%zapp_anon_key%'"
expect_value 'B21 os dois jobs mandam x-cron-secret' '2' \
  "SELECT count(*) FROM cron.job WHERE command LIKE '%x-cron-secret%'"
expect_value 'B22 o health check le o segredo DELE por subquery no Vault' 't' \
  "SELECT command LIKE '%vault.decrypted_secrets%' AND command LIKE '%connection_health_check_cron_secret%'
     FROM cron.job WHERE jobname = 'connection-health-check'"
expect_value 'B23 o avatars refresh le o segredo DELE por subquery no Vault' 't' \
  "SELECT command LIKE '%vault.decrypted_secrets%' AND command LIKE '%avatars_refresh_cron_secret%'
     FROM cron.job WHERE jobname = 'avatars-refresh'"
expect_value 'B24 nenhum job cruza o segredo do outro (sem credencial trocada)' '0' \
  "SELECT count(*) FROM cron.job
     WHERE (jobname = 'connection-health-check' AND command LIKE '%avatars_refresh_cron_secret%')
        OR (jobname = 'avatars-refresh' AND command LIKE '%connection_health_check_cron_secret%')"

echo
echo '── BLOCO B: reaplicando 20260930250000 (idempotencia: unschedule antes de schedule) ─'
psql_file "$migration_reschedule"

expect_value 'B25 reaplicar nao duplica job (2 no total)' '2' "SELECT count(*) FROM cron.job"
expect_value 'B26 e cada nome segue unico' '0' \
  "SELECT count(*) FROM (SELECT jobname FROM cron.job GROUP BY jobname HAVING count(*) > 1) d"

echo
echo '── BLOCO C: mutacao em COPIA temporaria (o arquivo do repo nao e tocado) ───────────'

mutated="$tmp_dir/20260930240000_cron_secret_dedicado_l5.sem_revoke.sql"
grep -v -E '^REVOKE ALL ON FUNCTION' "$migration_secrets" > "$mutated"

revokes_repo="$(grep -c -E '^REVOKE ALL ON FUNCTION' "$migration_secrets" || true)"
[[ "$revokes_repo" == '2' ]] || fail "o arquivo do repo deveria ter os 2 REVOKE (achei '$revokes_repo'); a mutacao e so na copia"
printf '[PASS] %s\n' 'C1 o arquivo do repo segue intacto (2 REVOKE); a mutacao e uma COPIA em $tmp_dir'

revokes_sem="$(grep -c -E '^REVOKE ALL ON FUNCTION' "$mutated" || true)"
[[ "$revokes_sem" == '0' ]] || fail "a copia mutada ainda tem REVOKE ('$revokes_sem')"
printf '[PASS] %s\n' 'C2 a copia mutada ficou sem os dois REVOKE'

# Banco limpo: se a ACL dependesse de estado anterior, a mutacao nao provaria nada.
docker exec "$container_name" createdb -U postgres mutacao
psql_file_db mutacao "$tmp_dir/pre.sql"
psql_file_db mutacao "$mutated"

expect_value_db 'C3 com o REVOKE removido, o EXECUTE volta para anon (o contrato exige false)' 't' \
  "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')" mutacao
expect_value_db 'C4 e volta tambem para authenticated' 't' \
  "SELECT has_function_privilege('authenticated','$RPC_AVATARS','EXECUTE')" mutacao

# A assercao do BLOCO B reexecutada contra a copia mutada: ela TEM de falhar.
# A mensagem crua da assercao e a EVIDENCIA (por isso vai rotulada, e nao como
# [FAIL] solto num log verde de CI).
mutacao_evidencia="$( ( expect_value_db 'C5 (mutacao) anon NAO tem EXECUTE na RPC do health check' 'f' \
    "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')" mutacao ) 2>&1 >/dev/null || true )"
if [[ "$mutacao_evidencia" == *"[FAIL]"* && "$mutacao_evidencia" == *"esperado 'f', obtido 't'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$mutacao_evidencia"
  printf '[PASS] %s\n' 'C5 a assercao de ACL do BLOCO B FALHA com o REVOKE removido (exit != 0)'
else
  printf '%s\n' "$mutacao_evidencia" >&2
  fail 'C5: a assercao de ACL do BLOCO B NAO derruba a mutacao (REVOKE removido passou)'
fi
expect_value_db 'C6 consequencia real: com o REVOKE fora, a anon LE o segredo dedicado' 't' \
  "SET ROLE anon; SELECT public.get_connection_health_check_cron_secret() IS NOT NULL" mutacao

echo
printf '[OK] contrato A/B/C dos segredos dedicados de cron (L5) verificado (%s)\n' "$postgres_image"
