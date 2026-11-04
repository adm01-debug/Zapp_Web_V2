#!/usr/bin/env bash
# Gmail CAS — 7 casos de cursor + 1 reset HTTP com Postgres/PostgREST descartáveis.
# Usa os handlers/testes reais e as migrations selecionadas; respostas Gmail
# vêm do stub versionado dos testes. Nenhuma credencial ou serviço oficial.
# Execute pelo retry-disposable-postgres-test.sh; no DB Guard, SKIP_DOCKER_SHIM=1.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"

pg_image="${GMAIL_CAS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
pgrst_image="${GMAIL_CAS_TEST_POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}"
umask 077
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/zapp-gmail-cas.XXXXXX")"
run_key="${run_dir##*.}"
pg_name="zapp-gmail-cas-pg-$run_key"
pgrst_name="zapp-gmail-cas-pgrst-$run_key"
net_name="zapp-gmail-cas-net-$run_key"
jwt_secret="gmail-cas-postgrest-test-secret-32-chars"
completed=false

cleanup() {
  local failed=0 kind id file
  # Os cidfiles são escritos pelo Docker apenas para os recursos criados nesta
  # execução. Uma colisão de nome não autoriza remover o recurso preexistente.
  for kind in pgrst pg network; do
    file="$run_dir/$kind.id"
    [[ -s "$file" ]] || continue
    id="$(cat "$file")"
    if [[ ! "$id" =~ ^[0-9a-f]{64}$ ]]; then
      printf '[FAIL] cleanup: ID inválido de %s; estado em %s\n' "$kind" "$run_dir" >&2
      failed=1
    elif { [[ "$kind" == network ]] && docker network rm "$id" >/dev/null 2>&1; } ||
         { [[ "$kind" != network ]] && docker rm -f "$id" >/dev/null 2>&1; }; then
      rm -f "$file" || failed=1
    else
      printf '[FAIL] cleanup: não removi %s %s; estado em %s\n' "$kind" "$id" "$run_dir" >&2
      failed=1
    fi
  done
  if [[ "$failed" == 0 ]]; then
    rm -rf "$run_dir" || failed=1
  fi
  return "$failed"
}
finish() {
  local status=$?
  trap - EXIT INT TERM
  if ! cleanup && [[ "$status" == 0 ]]; then status=1; fi
  if [[ "$status" == 0 && "$completed" != true ]]; then status=1; fi
  if [[ "$status" == 0 ]]; then
    printf '[OK] Gmail CAS: 7 cursor + 1 reset, zero ignorados; Postgres/PostgREST próprios removidos.\n'
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_id" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_id" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
command -v deno >/dev/null 2>&1 || fail 'Deno nao esta instalado'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 nao esta instalado'

docker network create --internal --label "zapp.edge-harness=$run_key" "$net_name" > "$run_dir/network.id"
docker create --cidfile "$run_dir/pg.id" --name "$pg_name" --network "$net_name" \
  --label "zapp.edge-harness=$run_key" \
  --add-host=tnnnlkbymytvtqngbbqh.supabase.co:127.0.0.1 \
  -e POSTGRES_PASSWORD=gmail_cas_test_only "$pg_image" \
  postgres -c cron.launch_active_jobs=off >/dev/null
pg_id="$(cat "$run_dir/pg.id")"
docker start "$pg_id" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$pg_id" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$pg_id" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'
cron_state="$(psql_query 'SHOW cron.launch_active_jobs')" || fail 'não consegui verificar o estado do cron'
[[ "$cron_state" == off ]] || fail 'cron não está desativado'
docker exec "$pg_id" cat /etc/hosts | grep -Eq \
  '^127\.0\.0\.1[[:space:]]+tnnnlkbymytvtqngbbqh\.supabase\.co([[:space:]]|$)' \
  || fail 'host oficial não foi neutralizado'

pass 'PostgreSQL descartável no ar; cron off e host oficial neutralizado'

# Pré-requisitos de plataforma da fixture; tabelas Gmail vêm das migrations reais.
psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  PASSWORD 'gmail_cas_test_only';
GRANT anon, authenticated, service_role TO authenticator;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id)
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
SQL

# Extrai somente as dependências Gmail dos arquivos que também alteram outros
# domínios. Cardinalidade e limites explícitos: drift nunca vira SQL aproximado.
python3 - "$migrations_dir" "$run_dir" <<'PY'
from pathlib import Path
import re
import sys

migrations, output = map(Path, sys.argv[1:])

def read(name):
    return (migrations / name).read_text(encoding="utf-8")

def one(pattern, source, label):
    matches = list(re.finditer(pattern, source, re.I | re.M | re.S))
    if len(matches) != 1:
        raise SystemExit(f"[FAIL] extração {label}: esperava 1 trecho, encontrei {len(matches)}")
    return matches[0].group(0)

def function(name, source):
    pattern = (r"^CREATE(?: OR REPLACE)? FUNCTION public\." + re.escape(name)
               + r"\([^)]*\)[^;]*?\bAS\s+(\$[A-Za-z_0-9]*\$).*?\1[^;]*;")
    return one(pattern, source, name)

functions = [
    function("update_updated_at_column", read("20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql")),
    function("is_admin_or_supervisor", read("20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql")),
]
hardening = read("20261010150628_search_path_pg_temp_is_admin_get_own_gmail.sql")
for verb in ("ALTER FUNCTION", "REVOKE EXECUTE ON FUNCTION", "GRANT EXECUTE ON FUNCTION"):
    functions.append(one(r"^" + verb + r" public\.is_admin_or_supervisor\([^)]*\)[^;]*;", hardening, verb))
(output / "helpers.sql").write_text("\n\n".join(functions) + "\n", encoding="utf-8")

source = read("20260404173941_26ed03e4-e874-44a0-b864-5db85b0ec44c.sql")
marker = "-- 2. Connection health logs"
if source.count(marker) != 1:
    raise SystemExit("[FAIL] limite do bloco Gmail mudou")
block = source.split(marker, 1)[0]
statements = list(re.finditer(r"^(?:DROP|CREATE) POLICY\b.*?;", block, re.I | re.M | re.S))
if len(statements) != 3 or any("ON public.gmail_accounts" not in match.group(0) for match in statements):
    raise SystemExit("[FAIL] bloco de políticas Gmail não corresponde à fonte esperada")
remaining = re.sub(r"^(?:DROP|CREATE) POLICY\b.*?;", "", block, flags=re.I | re.M | re.S)
if re.sub(r"--[^\n]*", "", remaining).strip():
    raise SystemExit("[FAIL] SQL inesperado no bloco de políticas Gmail")
(output / "owner-policy.sql").write_text(block, encoding="utf-8")

source = read("20260926200000_e17_referential_integrity_fks.sql")
add = one(r"^ALTER TABLE public\.gmail_accounts\s+ADD CONSTRAINT gmail_accounts_user_id_fkey\s+FOREIGN KEY[^;]*;", source, "Gmail FK ADD")
validate = one(r"^ALTER TABLE public\.gmail_accounts\s+VALIDATE CONSTRAINT gmail_accounts_user_id_fkey;", source, "Gmail FK VALIDATE")
(output / "gmail-fk.sql").write_text(add + "\n" + validate + "\n", encoding="utf-8")
PY
psql_script < "$run_dir/helpers.sql" >/dev/null

chain=(
  "$migrations_dir/20260403105341_f342fbf7-d1d3-48b1-83b0-03df78b6c590.sql"
  "$run_dir/owner-policy.sql"
  "$migrations_dir/20260828220000_gmail_accounts_history_watch.sql"
  "$migrations_dir/20260829030000_drop_insert_policies_email.sql"
  "$run_dir/gmail-fk.sql"
  "$migrations_dir/20260926240000_restrict_gmail_accounts_cascade.sql"
  "$migrations_dir/20261010113500_gmail_write_blocks_restrictive.sql"
  "$migrations_dir/20261010120000_email_rls_remover_ramo_admin.sql"
  "$migrations_dir/20261014023912_gmail_accounts_sync_backoff.sql"
)
for migration in "${chain[@]}"; do
  [[ -f "$migration" ]] || fail "migration ausente: ${migration##*/}"
  psql_script < "$migration" >/dev/null || fail "cadeia Gmail: ${migration##*/}"
done
pass "cadeia Gmail aplicada (${#chain[@]} estágios de migrations reais)"

# A fixture não cria contas Gmail: os dois arquivos reais são donos delas.
psql_script >/dev/null <<'SQL'
INSERT INTO auth.users (id) VALUES ('20000000-0000-4000-8000-0000000000b1');
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1');
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.gmail_accounts, public.email_threads, public.email_messages, public.email_labels
  TO service_role;

-- Verificação do contrato Gmail antes de expor a fixture no PostgREST.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('gmail_accounts', 'id'), ('gmail_accounts', 'user_id'),
      ('gmail_accounts', 'email_address'), ('gmail_accounts', 'is_active'),
      ('gmail_accounts', 'sync_status'), ('gmail_accounts', 'history_id'),
      ('gmail_accounts', 'last_sync_at'), ('gmail_accounts', 'last_error'),
      ('gmail_accounts', 'error_count'), ('gmail_accounts', 'next_attempt_at'),
      ('email_messages', 'id'), ('email_messages', 'thread_id'),
      ('email_messages', 'gmail_account_id'), ('email_messages', 'gmail_message_id')
    ) AS required(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = required.table_name
        AND c.column_name = required.column_name
    )
  ) THEN RAISE EXCEPTION 'fixture Gmail: coluna obrigatória ausente'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN
        ('gmail_accounts', 'email_threads', 'email_messages', 'email_labels')
        AND c.relrowsecurity) <> 4
  THEN RAISE EXCEPTION 'fixture Gmail: RLS ausente'; END IF;
  IF (SELECT count(*) FROM pg_policy
      WHERE polrelid = 'public.gmail_accounts'::regclass
        AND polcmd IN ('a', 'w', 'd') AND NOT polpermissive
        AND polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]) <> 3
  THEN RAISE EXCEPTION 'fixture Gmail: bloqueios restritivos ausentes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.gmail_accounts'::regclass
        AND conname = 'gmail_accounts_user_id_fkey'
        AND confrelid = 'auth.users'::regclass AND confdeltype = 'r' AND convalidated)
  THEN RAISE EXCEPTION 'fixture Gmail: FK RESTRICT ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'gmail_accounts'
        AND column_name = 'error_count' AND data_type = 'integer'
        AND is_nullable = 'NO' AND column_default = '0')
  THEN RAISE EXCEPTION 'fixture Gmail: backoff/default incompatível'; END IF;
END;
$check$;
SQL
pass 'fixture Gmail validada: profile, campos, RLS, políticas restritivas e FK RESTRICT'

for attempt in 1 2 3; do
  docker pull "$pgrst_image" >/dev/null 2>&1 && break
  printf 'WARN: pull de %s falhou (%s/3)\n' "$pgrst_image" "$attempt" >&2
  sleep "$((attempt * 10))"
done
docker image inspect "$pgrst_image" >/dev/null 2>&1 || fail "registro de imagens indisponivel ($pgrst_image)"
docker create --cidfile "$run_dir/pgrst.id" --name "$pgrst_name" --network "$net_name" \
  --label "zapp.edge-harness=$run_key" \
  -e PGRST_DB_URI="postgres://authenticator:gmail_cas_test_only@$pg_name:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$jwt_secret" -e PGRST_SERVER_PORT=3000 \
  "$pgrst_image" >/dev/null
pgrst_id="$(cat "$run_dir/pgrst.id")"
docker start "$pgrst_id" >/dev/null
# Docker Engine Linux: acesso pelo IP privado da única rede interna, sem -p.
# Filtrar inspect evita registrar Env/credenciais; o helper valida ambos os CIDs.
container_format='{"Id":{{json .Id}},"Config":{"Labels":{{json .Config.Labels}}},"State":{"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}},"Error":{{json .State.Error}}},"HostConfig":{"NetworkMode":{{json .HostConfig.NetworkMode}},"PortBindings":{{json .HostConfig.PortBindings}}},"NetworkSettings":{"Networks":{{json .NetworkSettings.Networks}},"Ports":{{json .NetworkSettings.Ports}}}}'
network_format='{"Id":{{json .Id}},"Labels":{{json .Labels}},"Name":{{json .Name}},"Internal":{{json .Internal}},"Driver":{{json .Driver}},"IPAM":{{json .IPAM}},"Containers":{{json .Containers}}}'
network_id="$(cat "$run_dir/network.id")"
docker inspect --format "$container_format" "$pgrst_id" > "$run_dir/pgrst.json" \
  || fail 'não consegui inspecionar o PostgREST próprio'
docker inspect --format "$container_format" "$pg_id" > "$run_dir/pg.json" \
  || fail 'não consegui inspecionar o PostgreSQL próprio'
docker network inspect --format "$network_format" "$network_id" > "$run_dir/network.json" \
  || fail 'não consegui inspecionar a rede interna própria'
if pgrest_url="$(python3 "$repo_root/scripts/db-audit/postgrest-internal-url.py" \
  "$run_dir/pgrst.json" "$run_dir/pg.json" "$run_dir/network.json" \
  "$pgrst_id" "$pg_id" "$network_id" "$run_key")"; then
  :
else
  metadata_status=$?
  if [[ "$metadata_status" == 2 ]]; then docker logs --tail 40 "$pgrst_id" >&2 || true; fi
  fail 'PostgREST não atende ao contrato da rede interna própria'
fi
postgrest_ready=false
for _ in $(seq 1 60); do
  if curl --noproxy '*' -sf --connect-timeout 2 --max-time 5 "$pgrest_url/" >/dev/null 2>&1; then postgrest_ready=true; break; fi
  sleep 1
done
[[ "$postgrest_ready" == true ]] || fail 'PostgREST não subiu'

jwt="$(JWT_SECRET="$jwt_secret" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b'=')
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
payload = b64(json.dumps({"role": "service_role", "exp": int(time.time()) + 3600}, separators=(',', ':')).encode())
signature = b64(hmac.new(os.environ['JWT_SECRET'].encode(), header + b'.' + payload, hashlib.sha256).digest())
print((header + b'.' + payload + b'.' + signature).decode())
PY
)"
curl --noproxy '*' --fail --silent --show-error --connect-timeout 2 --max-time 10 -H "Authorization: Bearer $jwt" \
  "$pgrest_url/profiles?select=user_id&limit=1" > "$run_dir/profile.json" \
  || fail 'preflight autenticado do profile falhou'
python3 - "$run_dir/profile.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    rows = json.load(handle)
if not isinstance(rows, list) or len(rows) != 1 or rows[0].get("user_id") != "20000000-0000-4000-8000-0000000000b1":
    raise SystemExit("[FAIL] o PostgREST não retornou o profile sintético esperado")
PY
pass 'PostgREST da rede interna autenticado com profile sintético'

for spec in gmail-cursor-cas-db:7 gmail-history-cas-db:1; do
  name="${spec%:*}"
  expected="${spec#*:}"
  GMAIL_CAS_POSTGREST_URL="$pgrest_url" GMAIL_CAS_JWT="$jwt" \
    deno test --config "$repo_root/scripts/ci/deno.json" --frozen \
      --junit-path "$run_dir/$name.xml" \
      --allow-env --allow-read --allow-net="127.0.0.1,${pgrest_url#http://}" \
      "$repo_root/supabase/functions/_shared/__tests__/$name.test.ts" \
    || fail "$name.test.ts falhou"
  python3 "$repo_root/scripts/db-audit/assert-deno-junit.py" "$run_dir/$name.xml" "$expected"
  # Os finally existentes não conferem o status do DELETE. Uma conta residual
  # reprova o harness, mesmo se Deno retornou zero; não alterar suas assertions.
  remaining_accounts="$(psql_query 'SELECT count(*) FROM public.gmail_accounts')" \
    || fail "$name: a verificação de contas residuais falhou"
  [[ "$remaining_accounts" == 0 ]] || fail "$name deixou conta Gmail residual"
done
completed=true
