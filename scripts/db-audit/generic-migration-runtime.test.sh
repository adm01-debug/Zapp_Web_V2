#!/usr/bin/env bash
# Prova as propriedades do contrato runtime GENERICO usado pelo db-migrate.yml
# quando a migration alvo nao tem contrato dedicado.
#
# O contrato generico nao afirma nada sobre a semantica da migration: ele existe
# para fechar a janela TOCTOU entre o dry-run e o apply. Portanto o que precisa
# ser provado aqui e (a) determinismo — o mesmo schema produz o mesmo hash — e
# (b) sensibilidade — qualquer DDL em public muda o hash. Um contrato que nao
# detecta uma das formas de DDL autorizaria um apply sobre um schema alterado.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="zapp-generic-runtime-test-$$"
test_dir=$(mktemp -d)
cleanup() {
  if [[ "$container_name" =~ ^zapp-generic-runtime-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

image="${GENERIC_RUNTIME_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=generic_runtime_fixture_only "$image" >/dev/null
ready=false
for _ in $(seq 1 45); do
  logs=$(docker logs "$container_name" 2>&1)
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] && \
    docker exec "$container_name" psql -X -U postgres -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'FAIL: PostgreSQL de teste não iniciou'; exit 1; }

db() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres "$@"; }

snapshots=0
# snap <nome>: aplica o contrato e exige saida nao vazia e JSON valido. Sem esta
# checagem, um contrato que falhasse silenciosamente produziria arquivos vazios
# e os diffs abaixo passariam comparando nada com nada.
snap() {
  local out="$test_dir/$1.json"
  db < "$repo_root/scripts/db-audit/generic-migration-runtime.sql" > "$out"
  if [[ ! -s "$out" ]]; then
    echo "FAIL: contrato generico devolveu saida vazia em '$1'"
    exit 1
  fi
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$out" \
    || { echo "FAIL: contrato generico devolveu JSON invalido em '$1'"; exit 1; }
  snapshots=$((snapshots + 1))
  printf '%s' "$out"
}
exige_igual() {
  diff -q "$1" "$2" >/dev/null || { echo "FAIL: $3"; exit 1; }
}
exige_diferente() {
  if diff -q "$1" "$2" >/dev/null; then echo "FAIL: $3"; exit 1; fi
}

db <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(
  version text PRIMARY KEY, name text, statements text[]);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260101000000','seed','{}');
CREATE TABLE public.t1(id int PRIMARY KEY, nome text NOT NULL);
CREATE FUNCTION public.f1() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS 'SELECT 1';
SQL

r1=$(snap r1)
node - "$r1" <<'NODE'
const fs = require('node:fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const obrigatorios = [
  'server_major', 'database', 'contract', 'structure_sha256', 'runtime_sha256',
  'table_count', 'view_count', 'matview_count', 'rls_enabled_count', 'function_count',
  'security_definer_count', 'security_definer_fixed_path_count', 'policy_count',
  'trigger_count', 'constraint_count', 'validated_constraint_count', 'index_count',
  'ledger_count',
];
for (const campo of obrigatorios) {
  if (!(campo in proof)) throw new Error(`FAIL: contrato generico sem o campo ${campo}`);
}
if (proof.contract !== 'generic') throw new Error(`FAIL: contract=${proof.contract}`);
if (proof.database !== 'postgres') throw new Error(`FAIL: database=${proof.database}`);
if (proof.server_major !== 17) throw new Error(`FAIL: server_major=${proof.server_major}`);
for (const campo of ['runtime_sha256', 'structure_sha256']) {
  if (!/^[a-f0-9]{64}$/.test(proof[campo] || '')) {
    throw new Error(`FAIL: ${campo} fora do formato sha256`);
  }
}
if (proof.ledger_count !== 1) throw new Error(`FAIL: ledger_count=${proof.ledger_count}`);
if (proof.security_definer_fixed_path_count !== 1) {
  throw new Error(`FAIL: security_definer_fixed_path_count=${proof.security_definer_fixed_path_count}`);
}
console.log('OK: contrato generico expoe os 18 campos com formatos validos.');
NODE

r2=$(snap r2)
exige_igual "$r1" "$r2" 'contrato generico nao e deterministico no mesmo schema'
echo 'OK: hash estavel entre duas leituras do mesmo schema.'

db -c 'CREATE TABLE public.t2(id int);' >/dev/null
r3=$(snap r3)
exige_diferente "$r2" "$r3" 'tabela nova nao mudou o hash'
echo 'OK: detecta tabela nova.'

db -c "CREATE OR REPLACE FUNCTION public.f1() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS 'SELECT 2';" >/dev/null
r4=$(snap r4)
exige_diferente "$r3" "$r4" 'corpo de funcao alterado nao mudou o hash'
echo 'OK: detecta alteracao apenas no corpo da funcao.'

db -c 'ALTER TABLE public.t1 ENABLE ROW LEVEL SECURITY;' >/dev/null
r5=$(snap r5)
exige_diferente "$r4" "$r5" 'ENABLE ROW LEVEL SECURITY nao mudou o hash'
echo 'OK: detecta RLS habilitada.'

db -c 'CREATE POLICY p1 ON public.t1 FOR SELECT USING (true);
CREATE INDEX i1 ON public.t1(nome);' >/dev/null
r6=$(snap r6)
exige_diferente "$r5" "$r6" 'policy e indice novos nao mudaram o hash'
echo 'OK: detecta policy e indice novos.'

db -c 'REVOKE ALL ON FUNCTION public.f1() FROM PUBLIC;' >/dev/null
r7=$(snap r7)
exige_diferente "$r6" "$r7" 'REVOKE em funcao nao mudou o hash'
echo 'OK: detecta mudanca de ACL de funcao.'

db -c "ALTER TABLE public.t2 ADD COLUMN extra text NOT NULL DEFAULT 'x';" >/dev/null
r8=$(snap r8)
exige_diferente "$r7" "$r8" 'coluna nova nao mudou o hash'
echo 'OK: detecta coluna nova.'

db <<'SQL'
CREATE FUNCTION public.tg() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
CREATE TRIGGER trg1 BEFORE INSERT ON public.t1 FOR EACH ROW EXECUTE FUNCTION public.tg();
SQL
r9=$(snap r9)
exige_diferente "$r8" "$r9" 'trigger nova nao mudou o hash'
echo 'OK: detecta trigger nova.'

db -c "INSERT INTO public.t1(id, nome) VALUES (1, 'x'); ANALYZE public.t1; ANALYZE public.t2;" >/dev/null
r10=$(snap r10)
exige_igual "$r9" "$r10" 'escrita de dados mudou o hash — o contrato nao pode depender de conteudo'
echo 'OK: imune a escrita de dados e a ANALYZE.'

db -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20260101000001','outra','{}');" >/dev/null
r11=$(snap r11)
exige_diferente "$r10" "$r11" 'registro novo no ledger nao mudou o hash'
echo 'OK: detecta registro novo no ledger.'

db -c 'CREATE SCHEMA outro; CREATE TABLE outro.x(id int);' >/dev/null
r12=$(snap r12)
exige_igual "$r11" "$r12" 'DDL fora de public mudou o hash — o escopo declarado e public'
echo 'OK: escopo limitado ao schema public.'

if [[ "$snapshots" != 12 ]]; then
  echo "FAIL: esperava 12 snapshots, obtive $snapshots"
  exit 1
fi
echo "OK: contrato runtime generico aprovado em 12 cenarios ($image)."
