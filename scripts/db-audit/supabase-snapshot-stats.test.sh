#!/usr/bin/env bash
# Contrato do filtro de top_queries: o regex vem do AST do snapshot real;
# somente PostgreSQL decide se as 48 strings casam. Nenhum banco oficial é usado.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${SNAPSHOT_STATS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-snapshot-stats-test-$$"
tmp_dir="$(mktemp -d)"
started=0
cleanup() {
  if [[ "$started" == 1 ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

[[ $# -eq 0 || ( $# -eq 1 && "${1:-}" == --emit-sql ) ]] || fail 'uso: supabase-snapshot-stats.test.sh [--emit-sql]'
command -v python3 >/dev/null 2>&1 || fail 'python3 nao esta instalado'

python3 - "$repo_root/scripts/supabase_snapshot/snapshot.py" "$tmp_dir" <<'PY'
import ast
import pathlib
import re
import sys

source_path, output_dir = map(pathlib.Path, sys.argv[1:])
source = source_path.read_text(encoding="utf-8")

def extract(text):
    tree = ast.parse(text)
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "get_db_stats"]
    if len(functions) != 1:
        raise SystemExit("FAIL: get_db_stats ausente ou ambiguo no snapshot")
    queries = []
    for node in ast.walk(functions[0]):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.func.id != "q" or len(node.args) < 2:
            continue
        argument = node.args[1]
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
            parts = [argument.value]
        elif isinstance(argument, ast.JoinedStr):
            # Se o filtro passar a ser interpolado, a extracao deve falhar em vez
            # de inventar o valor. Schema/limite ficam fora do trecho extraido.
            parts = [n.value if isinstance(n, ast.Constant) and isinstance(n.value, str) else "\x00" for n in argument.values]
        else:
            continue
        sql = "".join(parts)
        literals = re.findall(r"\bquery\s*~\*\s*('(?:''|[^'])*')", sql, flags=re.IGNORECASE)
        for literal in literals:
            if "\x00" in literal:
                raise SystemExit("FAIL: filtro top_queries interpolado; atualize o extrator")
            queries.append((literal, ast.get_source_segment(text, argument)))
    if len(queries) != 1:
        raise SystemExit("FAIL: filtro query ~* ausente ou ambiguo em get_db_stats")
    return queries[0]

predicate, sql_source = extract(source)
# Mutacao de uma unica fronteira na copia temporaria do codigo; o regex inteiro
# nunca e copiado para o teste. O mesmo extrator le a versao antiga.
if sql_source.count(r"\\y") != 1:
    raise SystemExit("FAIL: fronteira esperada ausente/ambigua; revise a mutacao de regressao")
legacy_source = source.replace(sql_source, sql_source.replace(r"\\y", r"\\b", 1), 1)
(output_dir / "snapshot-legacy.py").write_text(legacy_source, encoding="utf-8")
legacy_predicate, _ = extract((output_dir / "snapshot-legacy.py").read_text(encoding="utf-8"))
if predicate == legacy_predicate:
    raise SystemExit("FAIL: a mutacao nao alterou o filtro extraido")

cases = []
for verb in ("select", "with", "insert", "update", "delete", "merge"):
    cases.extend([
        (f"{verb}:simples", f"{verb} fixture", True),
        (f"{verb}:maiusculas", f"{verb.upper()} fixture", True),
        (f"{verb}:whitespace", f" \t\n{verb}\tfixture", True),
        (f"{verb}:comentario", f"{verb}/* fixture */ fixture", True),
        (f"{verb}:sufixo", f"{verb}x fixture", False),
        (f"{verb}:underscore", f"{verb}_fixture", False),
    ])
for label, query in [
    ("create", "CREATE ROLE fixture PASSWORD 'synthetic'"),
    ("alter", "ALTER ROLE fixture PASSWORD 'synthetic'"),
    ("drop", "DROP ROLE fixture"),
    ("grant", "GRANT USAGE ON SCHEMA public TO fixture"),
    ("revoke", "REVOKE USAGE ON SCHEMA public FROM fixture"),
    ("begin", "BEGIN"), ("commit", "COMMIT"), ("rollback", "ROLLBACK"),
    ("vacuum", "VACUUM fixture"), ("explain", "EXPLAIN SELECT 1"),
    ("vazia", ""), ("ausente", None),
]:
    cases.append((label, query, False))
assert len(cases) == 48 and len({label for label, _, _ in cases}) == 48
assert sum(expected for _, _, expected in cases) == 24

def literal(value):
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"

values = ",\n".join(f"({literal(label)}, {literal(query)}, {'true' if expected else 'false'})" for label, query, expected in cases)
for name, regex in (("current", predicate), ("legacy", legacy_predicate)):
    sql = f"""BEGIN;
SET LOCAL standard_conforming_strings = on;
CREATE TEMP TABLE snapshot_stats_results ON COMMIT DROP AS
SELECT label, expected, (query ~* {regex}) IS TRUE AS actual
FROM (VALUES
{values}
) AS cases(label, query, expected);
SELECT label, expected, actual FROM snapshot_stats_results
WHERE actual IS DISTINCT FROM expected ORDER BY label;
DO $contract$
DECLARE failures integer;
BEGIN
  IF (SELECT count(*) FROM snapshot_stats_results) <> 48 THEN
    RAISE EXCEPTION 'snapshot-stats: matriz incompleta';
  END IF;
  SELECT count(*) INTO failures FROM snapshot_stats_results
  WHERE actual IS DISTINCT FROM expected;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'snapshot-stats: %/48 divergencias', failures;
  END IF;
END;
$contract$;
ROLLBACK;
"""
    (output_dir / f"{name}.sql").write_text(sql, encoding="utf-8")
PY

# Permite verificar AST/fixtures em ambientes sem Docker. Nao e prova SQL.
if [[ "${1:-}" == --emit-sql ]]; then
  cat "$tmp_dir/current.sql" "$tmp_dir/legacy.sql"
  exit 0
fi

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
started=1
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1))
    (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL de teste não iniciou'

docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$tmp_dir/current.sql"
printf 'PASS: filtro do snapshot real passou nas 48 entradas\n'

if docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$tmp_dir/legacy.sql" > "$tmp_dir/legacy.log" 2>&1; then
  fail 'a versao antiga passou; contrato sem sensibilidade a regressao'
else
  legacy_status=$?
fi
if [[ "$legacy_status" != 3 ]] || ! grep -Fq 'snapshot-stats: 24/48 divergencias' "$tmp_dir/legacy.log"; then
  cat "$tmp_dir/legacy.log" >&2
  fail 'a versao antiga falhou por motivo diferente das 24 divergencias esperadas'
fi
printf 'PASS: copia antiga reprovou com exatamente 24/48 divergencias no PostgreSQL\n'
