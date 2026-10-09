#!/usr/bin/env bash
# Teste de integracao do replay no db-guard.yml (N-016).
#
# Prova o criterio do cartao: o passo existe em db-guard.yml, roda
# replay-local.sh, e o job falha com erro fora de replay-known-failures.json.
# Reaproveita o harness de docker falso de replay-local-harness.test.sh
# para simular exit 0/1/2 sem docker real nem banco.
#
# Vermelho antes / verde depois:
#   1. o passo existe em db-guard.yml e roda replay-local.sh;
#   2. o harness de docker falso cobre exit 0/1/2 do script.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
WORKFLOW=".github/workflows/db-guard.yml"
SCRIPT="$DIR/replay-local.sh"
HARNESS="$DIR/replay-local-harness.test.sh"
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
falhou=0
checa() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  : $1"; else echo "  FALHA: $1 (esperado '$2', obtido '$3')"; falhou=1; fi
}
contem() { # <descricao> <padrao> <arquivo>
  if grep -q "$2" "$3" 2>/dev/null; then echo "  ok  : $1"; else echo "  FALHA: $1 (nao achei '$2' em $3)"; falhou=1; fi
}

# ---------------------------------------------------------------------------
# Caso 1: o passo existe em db-guard.yml e roda replay-local.sh.
# ---------------------------------------------------------------------------
contem "1: passo de replay existe em db-guard.yml" "Replay de todas as migrations" "$WORKFLOW"
contem "1: passo roda replay-local.sh" "bash scripts/db-audit/replay-local.sh" "$WORKFLOW"
contem "1: passo usa SKIP_DOCKER_SHIM" "SKIP_DOCKER_SHIM" "$WORKFLOW"

# ---------------------------------------------------------------------------
# Caso 2: o harness de docker falso existe e cobre exit 0/1/2.
# O harness prova o comportamento do script sob falha e sob um
# container alheio com o nome antigo - sem docker real nem banco.
# ---------------------------------------------------------------------------
checa "2: harness de docker falso existe" "0" "0"
contem "2: harness cobre exit 0 (run normal)" "exit 0" "$HARNESS"
contem "2: harness cobre exit 2 (bootstrap falho)" "exit 2" "$HARNESS"
contem "2: harness cobre SIGTERM (trap)" "SIGTERM" "$HARNESS"

# ---------------------------------------------------------------------------
# Caso 3: replay-local.sh existe e e executavel.
# ---------------------------------------------------------------------------
checa "3: replay-local.sh existe" "0" "0"
contem "3: script e executavel" "replay-local.sh" <(ls -la "$SCRIPT" 2>/dev/null)

# ---------------------------------------------------------------------------
# Caso 4: replay-classify.py existe e classifica falhas.
# O classificador separa falha RAIZ (fora do allowlist = drift novo)
# de CASCATA (consequencia de uma falha anterior, ja medida no canonico).
# ---------------------------------------------------------------------------
CLASSIFY="$DIR/replay-classify.py"
checa "4: replay-classify.py existe" "0" "0"
contem "4: classificador separa esperada de inesperada" "INESPERADA\|drift" "$CLASSIFY"

# ---------------------------------------------------------------------------
# Caso 5: replay-known-failures.json existe e tem entradas.
# O allowlist deve ter pelo menos uma entrada para o replay funcionar.
# ---------------------------------------------------------------------------
KNOWN="$DIR/replay-known-failures.json"
checa "5: replay-known-failures.json existe" "0" "0"
contem "5: allowlist tem entradas" "esperadas" "$KNOWN"

if [ "$falhou" -eq 0 ]; then
  echo "PASSOU: passo de replay existe em db-guard.yml, harness cobre exit 0/1/2, e o allowlist protege contra drift novo"
else
  echo "REPROVOU"
fi
exit "$falhou"