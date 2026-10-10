#!/usr/bin/env bash
# ============================================================
# validate_destino.sh — roda VALIDATE_DESTINO.sql no banco destino
#
# Uso:
#   DESTINO_URL="postgresql://user:pass@host:5432/db" \
#     bash supabase-export/validate_destino.sh
#
# Ou:
#   bash supabase-export/validate_destino.sh "postgresql://..."
#
# Exit codes:
#   0 = tudo OK
#   1 = falha de validação (FAIL ou tabela sem PK/RLS)
#   2 = erro de conexão / arquivo
# ============================================================
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="$DIR/VALIDATE_DESTINO.sql"
PSQL_SAFE="$DIR/../scripts/db-audit/psql-safe.mjs"

JSON_SQL="$DIR/VALIDATE_DESTINO_JSON.sql"
CSV_FILE="${EXPORT_LOG_CSV:-$DIR/validation_log.csv}"
JSON_FILE="${EXPORT_LOG_JSON:-$DIR/validation_result.json}"

URL="${1:-${DESTINO_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "❌ Forneça a URL do destino: \$DESTINO_URL ou \$1"
  exit 2
fi
export DESTINO_URL="$URL"
if [[ ! -f "$SQL" ]]; then
  echo "❌ Arquivo não encontrado: $SQL"
  exit 2
fi

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

echo "▶  Validando destino..."
if ! node "$PSQL_SAFE" -v ON_ERROR_STOP=1 -f "$SQL" 2>&1 | tee "$OUT"; then
  echo "❌ psql falhou."
  exit 2
fi

# Conta apenas linhas DENTRO da tabela de resultados (entre bordas │),
# ignorando o cabeçalho/legenda do SQL.
FAIL_COUNT=$(grep -cE '│[^│]*❌ FAIL' "$OUT" || true)
EXTRA_COUNT=$(grep -cE '│[^│]*⚠️  EXTRA' "$OUT" || true)

echo
echo "──────────────────────────────────────────────"
echo " Resumo: $FAIL_COUNT FAIL  |  $EXTRA_COUNT EXTRA"
echo "──────────────────────────────────────────────"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "❌ Validação FALHOU — reaplique os blocos faltantes."
  exit 1
fi

echo "📝 Gerando logs de validação..."

# Gera JSON
if [[ -f "$JSON_SQL" ]]; then
  node "$PSQL_SAFE" -v ON_ERROR_STOP=1 -f "$JSON_SQL" -o "$JSON_FILE"
  echo "📄 JSON: $JSON_FILE"
fi

# Gera CSV (formato simplificado: timestamp, metric, actual, expected, status)
if [[ -f "$JSON_FILE" ]]; then
  # Usa python3 (pré-instalado) para converter JSON em CSV se disponível, ou uma abordagem simples
  python3 -c "
import json, csv, sys
with open('$JSON_FILE', 'r') as f:
    data = json.load(f)
ts = data['timestamp']
with open('$CSV_FILE', 'a', newline='') as f:
    writer = csv.writer(f)
    # Escreve cabeçalho se o arquivo estiver vazio
    if f.tell() == 0:
        writer.writerow(['timestamp', 'metric', 'actual', 'expected', 'status'])
    for m in data['metrics']:
        writer.writerow([ts, m['name'], m['actual'], m['expected'], m['status']])
"
  echo "📊 CSV: $CSV_FILE (append)"
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "❌ Validação FALHOU — reaplique os blocos faltantes."
  exit 1
fi

echo "✅ Destino validado com sucesso."
exit 0
