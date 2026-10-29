#!/usr/bin/env bash
# W56: teste offline do docker-shim.
# Nao precisa de Docker real nem de Postgres real — usa stubs no PATH.
# Cobre: run, logs, exec psql, rm, pull, tag, image inspect, SKIP_DOCKER_SHIM.
set -Eeuo pipefail

SHIM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-shim"
TMPDIR_TEST="$(mktemp -d)"
STATE_DIR="$TMPDIR_TEST/state"
BIN_DIR="$TMPDIR_TEST/bin"
mkdir -p "$STATE_DIR" "$BIN_DIR"

PASS=0
FAIL=0

ok() { printf '[OK]   %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '[FAIL] %s\n' "$1" >&2; FAIL=$((FAIL+1)); }
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then ok "$desc"
  else fail "$desc: esperado '$expected', obtido '$actual'"; fi
}

cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT INT TERM

# ── fake docker (DOCKER_REAL) ─────────────────────────────────────────────────
# Só usado quando o shim passa a chamada adiante (SKIP_DOCKER_SHIM=1 ou
# comando desconhecido sem estado). Grava o que recebeu em $TMPDIR_TEST/docker.log
cat > "$BIN_DIR/docker" << 'ENDFAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TMPDIR_TEST_LOG/docker.log"
exit 0
ENDFAKE
# O heredoc nao expande $TMPDIR_TEST dentro — injetar via sed
sed -i "s|\$TMPDIR_TEST_LOG|$TMPDIR_TEST|g" "$BIN_DIR/docker"
chmod +x "$BIN_DIR/docker"

# ── fake psql ─────────────────────────────────────────────────────────────────
# Simula as chamadas do shim:
#   SELECT rolname FROM pg_roles  → lista fixa de roles
#   CREATE DATABASE / DROP DATABASE / DDL    → exit 0 (silencioso)
#   qualquer outra -c ou -f  → exit 0 (silencioso)
cat > "$BIN_DIR/psql" << 'ENDPSQL'
#!/usr/bin/env bash
# Detecta a query pelo ultimo argumento -c
query=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c) shift; query="$1";;
    *) ;;
  esac
  shift 2>/dev/null || shift
done
if printf '%s' "$query" | grep -qi "rolname"; then
  printf 'postgres\n'
  printf 'supabase_admin\n'
fi
exit 0
ENDPSQL
chmod +x "$BIN_DIR/psql"

export PATH="$BIN_DIR:$PATH"

# Variaveis de ambiente do shim
export DOCKER_REAL="$BIN_DIR/docker"
export POSTGRES_SERVICE_HOST="127.0.0.1"
export POSTGRES_SERVICE_PORT="5432"
export POSTGRES_SERVICE_PASS="testpass"
export POSTGRES_SERVICE_USER="postgres"
export DOCKER_SHIM_STATE_DIR="$STATE_DIR"

# ── 1. docker run --name ──────────────────────────────────────────────────────
out="$("$SHIM" run --name my_container postgres:17-alpine)"
check "run: retorna shimid" "shimid_my_container" "$out"
[[ -f "$STATE_DIR/my_container.db" ]] \
  && ok "run: cria arquivo de estado .db" \
  || fail "run: nao criou arquivo de estado .db"
db_name="$(cat "$STATE_DIR/my_container.db")"
check "run: nome sanitizado comeca com shim_" "shim_" "$db_name"

# ── 2. docker logs ────────────────────────────────────────────────────────────
logs_out="$("$SHIM" logs my_container)"
check "logs: emite 'database system is ready'" "database system is ready to accept connections" "$logs_out"
check "logs: emite texto de initdb" "PostgreSQL init process complete" "$logs_out"

# ── 3. docker exec ... psql ───────────────────────────────────────────────────
# Deve passar o psql apontando para o DB do shim; exit 0
"$SHIM" exec -i my_container psql -c "SELECT 1;" \
  && ok "exec psql: sai com 0" \
  || fail "exec psql: saiu com erro"

# ── 4. docker exec comando nao-psql → erro ────────────────────────────────────
if "$SHIM" exec -i my_container bash -c "echo x" 2>/dev/null; then
  fail "exec nao-psql: devia falhar"
else
  ok "exec nao-psql: falha esperada"
fi

# ── 5. docker rm ─────────────────────────────────────────────────────────────
"$SHIM" rm -f my_container \
  && ok "rm: sai com 0" \
  || fail "rm: saiu com erro"
[[ ! -f "$STATE_DIR/my_container.db" ]] \
  && ok "rm: remove arquivo de estado .db" \
  || fail "rm: nao removeu arquivo de estado .db"

# ── 6. docker logs de container sem estado → passa pro real ───────────────────
>"$TMPDIR_TEST/docker.log"
"$SHIM" logs unknown_container 2>/dev/null || true
[[ -f "$TMPDIR_TEST/docker.log" ]] \
  && ok "logs container desconhecido: delega ao DOCKER_REAL" \
  || fail "logs container desconhecido: nao delegou"

# ── 7. docker pull → exit 0 sem chamar o real ─────────────────────────────────
>"$TMPDIR_TEST/docker.log"
"$SHIM" pull postgres:17-alpine \
  && ok "pull: sai com 0" \
  || fail "pull: saiu com erro"
# pull nao deve chamar DOCKER_REAL
if [[ -s "$TMPDIR_TEST/docker.log" ]]; then
  fail "pull: chamou DOCKER_REAL indevidamente"
else
  ok "pull: nao chamou DOCKER_REAL"
fi

# ── 8. docker tag → exit 0 sem chamar o real ─────────────────────────────────
>"$TMPDIR_TEST/docker.log"
"$SHIM" tag postgres:17-alpine local/test:latest \
  && ok "tag: sai com 0" \
  || fail "tag: saiu com erro"
if [[ -s "$TMPDIR_TEST/docker.log" ]]; then
  fail "tag: chamou DOCKER_REAL indevidamente"
else
  ok "tag: nao chamou DOCKER_REAL"
fi

# ── 9. docker image inspect → exit 0 ──────────────────────────────────────────
"$SHIM" image inspect postgres:17-alpine \
  && ok "image inspect: sai com 0" \
  || fail "image inspect: saiu com erro"

# ── 10. SKIP_DOCKER_SHIM=1 → passa tudo pro real ─────────────────────────────
>"$TMPDIR_TEST/docker.log"
SKIP_DOCKER_SHIM=1 "$SHIM" ps -a 2>/dev/null || true
grep -q "ps -a" "$TMPDIR_TEST/docker.log" \
  && ok "SKIP_DOCKER_SHIM=1: delega ao DOCKER_REAL" \
  || fail "SKIP_DOCKER_SHIM=1: nao delegou ao DOCKER_REAL"

# ── 11. docker run sem --name → passa pro real ────────────────────────────────
>"$TMPDIR_TEST/docker.log"
"$SHIM" run postgres:17-alpine 2>/dev/null || true
grep -q "run postgres" "$TMPDIR_TEST/docker.log" \
  && ok "run sem --name: delega ao DOCKER_REAL" \
  || fail "run sem --name: nao delegou ao DOCKER_REAL"

# ── resultado final ───────────────────────────────────────────────────────────
printf '\n%d/%d testes passaram\n' "$PASS" "$((PASS+FAIL))"
if [[ "$FAIL" -gt 0 ]]; then
  printf '[ERRO] %d falha(s)\n' "$FAIL" >&2
  exit 1
fi
exit 0
