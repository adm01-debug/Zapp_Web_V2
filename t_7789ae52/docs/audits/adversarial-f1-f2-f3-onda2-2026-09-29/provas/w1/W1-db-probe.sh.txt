#!/usr/bin/env bash
# W1 (onda 2) — sonda no banco CANONICO via gateway MCP (somente leitura).
# O gateway respondeu 200 no initialize; o wrapper ~/projetos/mcp-clone-bwwbey/zapp_db.py devolve vazio.
# Uso: bash W1-probes/W1-db-probe.sh "SELECT ..."
set -Eeuo pipefail

url="$(cat "$HOME/projetos/mcp-clone-bwwbey/gateway_url.txt" | tr -d '\n\r')"
sql="$1"
case "${sql^^}" in
  SELECT*) ;;
  *) echo "RECUSADO: so SELECT (sonda read-only)"; exit 64;;
esac

payload=$(python3 - "$sql" <<'PY'
import json, sys
print(json.dumps({
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {"name": "db_query", "arguments": {"sql": sys.argv[1], "max_rows": 50}},
}))
PY
)

timeout 60 curl -s -m 55 -X POST "$url" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "$payload" | python3 -c "
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print('RESPOSTA NAO-JSON:', raw[:400]); raise SystemExit(1)
if 'error' in d:
    print('JSONRPC-ERROR:', json.dumps(d['error'])[:400]); raise SystemExit(1)
res = d.get('result', {})
for c in res.get('content', []):
    print(c.get('text', ''))
if res.get('isError'):
    raise SystemExit(3)
"
