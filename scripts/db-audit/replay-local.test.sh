#!/usr/bin/env bash
# Teste do gate de replay local (E24).
#
# Prova que o replay-local.sh esta integrado ao db-guard.yml como passo
# de CI com SKIP_DOCKER_SHIM=1 e que o check-test-inventory nao o
# considera orfao. A mutacao do caso 2 e o discriminante: se o passo
# nao existir no YAML, o teste falha (vermelho); com o passo, passa
# (verde).
set -u
DIR=$(dirname "$0")
REPLAY_LOCAL="$DIR/replay-local.sh"
GUARD_YAML=".github/workflows/db-guard.yml"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")

falhou=0
checa() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  : $1"; else echo "  FALHA: $1 (esperado "$2", obtido "$3")"; falhou=1; fi
}

# 1. replay-local.sh existe e e executavel
[ -f "$REPLAY_LOCAL" ] && checa "replay-local.sh existe" "0" "0" || { echo "  FALHA: replay-local.sh nao existe"; falhou=1; }
[ -x "$REPLAY_LOCAL" ] && checa "replay-local.sh e executavel" "0" "0" || { echo "  FALHA: replay-local.sh nao e executavel"; falhou=1; }

# 2. replay-local.sh tem set -u e chama replay-classify.py
grep -q 'set -u' "$REPLAY_LOCAL" && checa "replay-local.sh tem set -u" "0" "0" || { echo "  FALHA: replay-local.sh nao tem set -u"; falhou=1; }
grep -q 'replay-classify.py' "$REPLAY_LOCAL" && checa "replay-local.sh chama replay-classify.py" "0" "0" || { echo "  FALHA: replay-local.sh nao chama replay-classify.py"; falhou=1; }
grep -q 'replay-known-failures.json' "$REPLAY_LOCAL" && checa "replay-local.sh usa replay-known-failures.json" "0" "0" || { echo "  FALHA: replay-local.sh nao usa replay-known-failures.json"; falhou=1; }

# 3. db-guard.yml tem o passo do replay-local.sh com SKIP_DOCKER_SHIM
grep -q 'replay-local.sh' "$ROOT/$GUARD_YAML" && checa "db-guard.yml tem passo replay-local.sh" "0" "0" || { echo "  FALHA: db-guard.yml nao tem passo replay-local.sh"; falhou=1; }
grep -q 'SKIP_DOCKER_SHIM' "$ROOT/$GUARD_YAML" && checa "db-guard.yml tem SKIP_DOCKER_SHIM no passo replay" "0" "0" || { echo "  FALHA: db-guard.yml nao tem SKIP_DOCKER_SHIM no passo replay"; falhou=1; }

# 4. check-test-inventory nao sinaliza replay-local.test.sh como orfao
#    (o passo no YAML cobre o teste).
node "$ROOT/scripts/ci/check-test-inventory.mjs" >/dev/null 2>&1 && checa "check-test-inventory nao sinaliza orfaos" "0" "0" || { echo "  FALHA: check-test-inventory sinalizou orfaos"; falhou=1; }

[ "$falhou" -eq 0 ] && echo "PASSOU: integracao do replay local verificada" || echo "REPROVOU"
exit "$falhou"
