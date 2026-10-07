#!/usr/bin/env bash
# R2-INF-004 (P1, item 94) — "Os 12 contratos de runtime sao Bash enviados como SQL;
# 767 versoes nao tem arquivo" (docs/reconciliation/reaudit/2026-10-03/reports/infra).
#
# O passo "Provar estado runtime antes do push" do db-migrate.yml chama
# `node scripts/db-audit/run-runtime-contract.mjs "$TARGET_VERSION"` e faz JSON.parse
# do resultado. Os contratos vivem em scripts/db-audit/contracts/<versao>.sql como o
# TEXTO do braco do `case` de origem -- shell, terminando em `RUNTIME=$(node ... )`.
#
# DEFEITO MEDIDO: o executor passava esse texto a psql via `-c`, como se fosse SQL.
#   BLOCO A prova o mecanismo: os 12 arquivos, entregues ao psql exatamente como o
#   executor fazia, sao recusados (texto de shell nao e SQL) -> a rota nunca produzia
#   a prova JSON. E, para as versoes sem arquivo dedicado (o inventario do preflight,
#   "767 versoes" na auditoria), o executor saia com 2 antes de qualquer fallback,
#   embora o workflow tenha o ramo `proof.contract === 'generic'` esperando o contrato
#   generico (scripts/db-audit/generic-migration-runtime.sql).
#   BLOCO B prova a correcao pelo CONSUMIDOR REAL: o proprio executor, para as tres
#   classes de contrato (SQL inline, SQL em arquivo e generico), contra Postgres 17
#   descartavel, com a forma COMPLETA do JSON e os valores que o workflow exige.
#   BLOCO C prova, sem banco, o que a extracao declara: as versoes suportadas (as do
#   `case` de origem), a cobertura de todo o inventario de supabase/migrations pelo
#   fallback, e a recusa de shell disfarcado de SQL.
#
# Nada aqui toca banco oficial: so o container descartavel criado por este script.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${RUNTIME_CONTRACT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-runtime-contract-test-$$"
contratos_dir="$repo_root/scripts/db-audit/contracts"
migration_do_fixture="supabase/migrations/20260830170000_get_team_profiles_active_filter.sql"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-runtime-contract-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() {
  docker exec "$container_name" \
    psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" \
    psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# ---------- container descartavel ----------
# Auth `trust` de proposito: o container vive so na interface de loopback (porta
# aleatoria) e morre no trap. Assim nenhuma credencial -- nem sintetica -- entra no
# arquivo, e a URL abaixo nao carrega `usuario:senha@` (o guard de segredos do repo
# recusa esse padrao em linha nova de diff).
docker run --rm -d --name "$container_name" \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1::5432 "$postgres_image" >/dev/null

wait_for_postgres() {
  local tentativa logs
  for tentativa in $(seq 1 60); do
    logs="$(docker logs "$container_name" 2>&1 || true)"
    if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
      docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}
wait_for_postgres || fail "PostgreSQL descartavel nao iniciou"

porta_host="$(docker port "$container_name" 5432/tcp | head -n1 | sed 's/.*://')"
[[ "$porta_host" =~ ^[0-9]+$ ]] || fail "nao consegui descobrir a porta publicada do container"
destino_url="postgresql://postgres@127.0.0.1:${porta_host}/postgres"
export destino_url

# O executor roda do repo (os contratos usam caminhos relativos, como no workflow).
roda_runner() {
  local versao="$1"
  ( cd "$repo_root" && DESTINO_URL="$destino_url" node scripts/db-audit/run-runtime-contract.mjs "$versao" )
}

# Confere a forma COMPLETA do JSON e os valores exigidos pelo workflow para a classe.
confere_json() {
  local rotulo="$1" esperado="$2" chaves="$3"
  PROVA="$4" ESPERADO="$esperado" CHAVES="$chaves" node --input-type=module <<'NODE' || fail "$rotulo: forma/valores do JSON"
import assert from 'node:assert/strict';
const prova = JSON.parse(process.env.PROVA);
const chaves = JSON.parse(process.env.CHAVES).sort();
const esperado = JSON.parse(process.env.ESPERADO);
assert.deepEqual(Object.keys(prova).sort(), chaves, 'conjunto de chaves do JSON de runtime');
for (const [chave, valor] of Object.entries(esperado)) {
  assert.deepEqual(prova[chave], valor, `campo ${chave}`);
}
for (const [chave, valor] of Object.entries(prova)) {
  if (chave.endsWith('sha256')) assert.match(String(valor), /^[a-f0-9]{64}$/, `${chave} tem de ser sha256`);
}
NODE
  pass "$rotulo"
}

# ---------- fixture minima ----------
psql_sql "
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);
  INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('20260830170000', 'fixture');
  CREATE TABLE public.profiles(
    id uuid PRIMARY KEY, user_id uuid, name text, email text, avatar_url text,
    role text, is_active boolean, department text, job_title text, phone text,
    max_chats integer, created_at timestamptz
  );
  CREATE TABLE public.contact_notes(id uuid PRIMARY KEY);
" >/dev/null
# Estado da versao 20260830170000 aplicado pelo ARQUIVO REAL da migration.
psql_file "$repo_root/$migration_do_fixture" >/dev/null

printf '\n== BLOCO A: o texto dos contratos nao e SQL (mecanismo do defeito) ==\n'
total_contratos=0
for arquivo in "$contratos_dir"/*.sql; do
  total_contratos=$((total_contratos + 1))
  if psql_sql "$(cat "$arquivo")" >/dev/null 2>&1; then
    fail "$(basename "$arquivo"): o texto do contrato foi aceito como SQL -- o defeito R2-INF-004 nao existe?"
  fi
done
[[ "$total_contratos" -eq 12 ]] || fail "esperava 12 contratos, achei $total_contratos"
pass "os 12 contratos sao recusados pelo psql quando enviados como SQL (por isso a rota nao produzia o JSON)"

printf '\n== BLOCO B: o executor entrega a prova JSON das tres classes de contrato ==\n'

# Classe 1 — contrato dedicado com SQL inline em -c "..."
prova_inline="$(roda_runner 20260830170000)" || fail "classe inline (20260830170000): executor saiu != 0"
[[ "$prova_inline" != *$'\n'* ]] || fail "classe inline: stdout com mais de uma linha (o JSON.parse do workflow quebraria)"
confere_json "classe inline (20260830170000): JSON completo e valores do workflow" \
  '{"server_major":17,"database":"postgres","function_count":1,"security_definer":true,"stable":true,"search_path_fixed":true,"filters_active":true}' \
  '["server_major","database","function_count","security_definer","stable","search_path_fixed","filters_active","runtime_sha256"]' \
  "$prova_inline"

# Classe 2 — contrato dedicado com o SQL em arquivo (-f)
prova_arquivo="$(roda_runner 20260909200000)" || fail "classe arquivo (20260909200000): executor saiu != 0"
[[ "$prova_arquivo" != *$'\n'* ]] || fail "classe arquivo: stdout com mais de uma linha"
confere_json "classe arquivo (20260909200000): JSON completo e valores do workflow" \
  '{"server_major":17,"database":"postgres","note_table_count":1,"note_rls_enabled":false,"function_count":0,"policy_count":0,"anon_note_access":false,"authenticated_note_crud":false}' \
  '["server_major","database","note_table_count","note_rls_enabled","function_count","safe_function_count","caller_bound_count","rpc_authorized_count","policy_count","policy_signature_count","identity_trigger_count","definition_sha256","authenticated_api_execute_count","anon_api_execute_count","guard_authenticated_execute","guard_anon_execute","anon_note_access","authenticated_note_crud","authenticated_note_extra","service_note_crud","service_note_extra","runtime_sha256"]' \
  "$prova_arquivo"

# Classe 3 — versao SEM contrato dedicado (o inventario do preflight) cai no generico.
sem_contrato="$(cd "$repo_root" && ls supabase/migrations | grep -E '^[0-9]{14}_' | sed 's/_.*//' | sort -u | grep -vx -e 20260830170000 -e 20260831120000 -e 20260831150000 -e 20260908180000 -e 20260908220000 -e 20260909120000 -e 20260909180000 -e 20260909200000 -e 20260909210000 -e 20260909220000 -e 20260909230000 -e 20260909240000 -e 20260909250000 -e 20260909260000 -e 20260909270000 -e 20260910100000 -e 20260912130000 -e 20260912140000 -e 20260922220000 | tail -n1)"
[[ -n "$sem_contrato" ]] || fail "o inventario nao tem nenhuma versao sem contrato dedicado"
erro_generico="$(cd "$repo_root" && DESTINO_URL="$destino_url" node scripts/db-audit/run-runtime-contract.mjs "$sem_contrato" 2>&1 >/dev/null)" || true
[[ "$erro_generico" == *'contrato runtime generico'* ]] || fail "versao $sem_contrato (sem contrato dedicado) nao anunciou o fallback generico: $erro_generico"
prova_generico="$(roda_runner "$sem_contrato")" || fail "classe generica ($sem_contrato): executor saiu != 0"
[[ "$prova_generico" != *$'\n'* ]] || fail "classe generica: stdout com mais de uma linha"
confere_json "classe generica ($sem_contrato): JSON que o ramo proof.contract === 'generic' aceita" \
  '{"server_major":17,"database":"postgres","contract":"generic","table_count":2,"function_count":1,"policy_count":0,"ledger_count":1}' \
  '["server_major","database","contract","table_count","view_count","matview_count","rls_enabled_count","function_count","security_definer_count","security_definer_fixed_path_count","policy_count","trigger_count","constraint_count","validated_constraint_count","index_count","ledger_count","structure_sha256","runtime_sha256"]' \
  "$prova_generico"

printf '\n== BLOCO C: versoes suportadas, cobertura do inventario e recusa de shell ==\n'
cd "$repo_root"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extrairInvocacoes,
  resolverInvocacao,
  invocacoesDosContratos,
  desfazerAspasDuplasBash,
} from './scripts/db-audit/run-runtime-contract.mjs';

// As versoes suportadas e o contrato de cada uma, conforme os rotulos do `case` que
// originou os arquivos (E62). O agrupamento com `|` vale para todas as versoes dele.
const ESPERADO = {
  20260830170000: { sql: /get_team_profiles/ },
  20260831120000: { sql: /webhook_failures/ },
  20260831150000: { sql: /messages/ },
  20260908180000: { sql: /crm_contact_links/ },
  20260908220000: { sql: /crm_sync_outbox/ },
  20260909120000: { sql: /crm/ },
  20260909180000: { sql: /global_settings/ },
  20260909200000: { arquivo: 'scripts/db-audit/inbox-contact-authorization-runtime.sql' },
  20260909210000: { arquivo: 'scripts/db-audit/talkx-template-history-runtime.sql' },
  20260909220000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909240000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909250000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909260000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909270000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909230000: { arquivo: 'scripts/db-audit/talkx-template-history-runtime.sql' },
  20260910100000: { arquivo: 'scripts/db-audit/talkx-blacklist-policy-runtime.sql' },
  20260912130000: { arquivo: 'scripts/db-audit/talkx-recovery-runtime.sql' },
  20260912140000: { arquivo: 'scripts/db-audit/talkx-recovery-runtime.sql' },
  20260922220000: { arquivo: 'scripts/db-audit/notification-delivery-atomicity-runtime.sql' },
};

for (const [versao, esperado] of Object.entries(ESPERADO)) {
  const invocacao = resolverInvocacao(versao);
  assert.equal(invocacao.generico, false, `${versao} tem de ter contrato dedicado`);
  if (esperado.arquivo) assert.equal(invocacao.arquivo, esperado.arquivo, `contrato de ${versao}`);
  if (esperado.sql) assert.match(invocacao.sql ?? '', esperado.sql, `SQL de ${versao}`);
  for (const arquivo of [invocacao.arquivo].filter(Boolean)) {
    readFileSync(arquivo, 'utf8'); // o arquivo declarado tem de existir no repo
  }
}
console.log(`[PASS] as ${Object.keys(ESPERADO).length} versoes suportadas resolvem para o contrato do case de origem`);

// Cobertura do inventario aceito pelo preflight: TODA versao de supabase/migrations
// resolve -- dedicada ou pelo generico. Nenhuma pode abortar o passo.
const versoes = readdirSync('supabase/migrations')
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .map((f) => f.slice(0, 14));
assert.ok(versoes.length > 700, `inventario pequeno demais: ${versoes.length}`);
let dedicadas = 0;
for (const versao of versoes) {
  const invocacao = resolverInvocacao(versao);
  if (invocacao.generico) {
    assert.equal(invocacao.arquivo, 'scripts/db-audit/generic-migration-runtime.sql', `fallback de ${versao}`);
  } else {
    dedicadas += 1;
  }
}
assert.equal(dedicadas, Object.keys(ESPERADO).length, 'dedicadas = versoes suportadas do case');
console.log(`[PASS] inventario coberto: ${versoes.length} versoes resolvem (${dedicadas} dedicadas, ${versoes.length - dedicadas} pelo generico)`);

// O generico e unico, e nao ha versao declarada duas vezes.
const { generico } = invocacoesDosContratos();
assert.equal(generico.arquivo, 'scripts/db-audit/generic-migration-runtime.sql');

// Recusa de shell disfarcado de SQL e de forma nao declarada (fail-closed).
const recusa = (texto, esperado, rotulo) => {
  assert.throws(() => extrairInvocacoes(texto, '20260101000000', 'sintetico'), esperado, rotulo);
};
recusa(
  '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n                RUNTIME=$(node y.mjs -c "select 1")\n              ")',
  /substituicao de shell|fechamento/,
  'shell dentro do -c',
);
recusa(
  '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At --file=algo.sql)',
  /forma nao declarada/,
  'forma nao declarada',
);
recusa(
  '              RUNTIME=$(node x.mjs -X -At -c "\n                SELECT 1\n              ")',
  /ON_ERROR_STOP/,
  'SQL sem ON_ERROR_STOP',
);
recusa(
  '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n                echo oi\n              ")',
  /nao comeca por WITH\/SELECT\/VALUES/,
  'texto de shell sem SQL',
);
assert.throws(() => resolverInvocacao('abc'), /versao alvo invalida/);

// O corpo do -c "..." e string bash entre aspas duplas, nao SQL literal: o
// parser desfaz os escapes que o bash desfaz e recusa (fail-closed) o que o
// bash reinterpretaria — expansao, crase solta e barra invertida fora dos 4
// escapes que o bash define dentro de aspas duplas.
const inlineDe = (corpo) =>
  '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
  `${corpo}\n` +
  '              ")';
{
  // Oraculo: para bash, "SELECT 'a\"b', 'c\\d', '\$e'" entrega SELECT 'a"b', 'c\d', '$e'
  const [inv] = extrairInvocacoes(
    inlineDe(String.raw`SELECT 'a\"b', 'c\\d', '\$e'`),
    '20260101000000',
    'sintetico',
  );
  assert.equal(inv.sql, `SELECT 'a"b', 'c\\d', '$e'`, 'escapes \" \\ \$ tem de ser desfeitos');
  assert.equal(
    desfazerAspasDuplasBash('linha1\\\nlinha2', 'sintetico'),
    'linha1linha2',
    'continuacao de linha do bash (barra + newline) tem de sumir',
  );
}
for (const corpo of [
  'SELECT $A',
  'SELECT $1',
  'SELECT $_',
  'SELECT 1 $$',
  'SELECT $(id)',
  'SELECT ${x}',
  'SELECT `id`',
  String.raw`SELECT 'a\nb'`,
]) {
  assert.throws(
    () => extrairInvocacoes(inlineDe(corpo), '20260101000000', 'sintetico'),
    /substituicao de shell|barra invertida/,
    `expansao/escape proibido foi aceito: ${corpo}`,
  );
}
console.log('[PASS] corpo do -c tratado como string bash: escapes desfeitos e $VAR/$$/$1/$_/$(/${/crase/barra recusados');

// Prova individual dos 7 contratos inline: o SQL extraido tem de ser
// EXATAMENTE o que o bash entrega ao psql — o corpo bruto do arquivo e
// reprocessado por um bash de verdade (printf '%s' "<corpo>").
const dirOraculoBash = mkdtempSync(join(tmpdir(), 'oraculo-bash-'));
try {
  for (const versao of [
    '20260830170000',
    '20260831120000',
    '20260831150000',
    '20260908180000',
    '20260908220000',
    '20260909120000',
    '20260909180000',
  ]) {
    const texto = readFileSync(`scripts/db-audit/contracts/${versao}.sql`, 'utf8');
    const [inv] = extrairInvocacoes(texto, versao, `${versao}.sql`);
    assert.ok(inv.sql, `${versao}: contrato inline`);
    // corpo bruto entre `-c "` e o ultimo `")`: o texto que o bash recebe
    const corpoBruto = texto.slice(texto.indexOf('-c "') + 4, texto.lastIndexOf('")'));
    const script = join(dirOraculoBash, `${versao}.sh`);
    writeFileSync(script, `printf '%s' "${corpoBruto}"\n`);
    const bash = spawnSync('bash', [script], { encoding: 'utf8' });
    assert.equal(bash.status, 0, `${versao}: bash ${bash.stderr}`);
    // O bash entrega um \n a mais no inicio (a quebra depois de `-c "`):
    // compara com trim dos dois lados.
    assert.equal(inv.sql, bash.stdout.trim(), `versao ${versao}`);
    console.log(`[PASS] ${versao}: o SQL extraido e o que o bash entrega ao psql`);
  }
} finally {
  rmSync(dirOraculoBash, { recursive: true, force: true });
}
console.log('[PASS] os 7 contratos inline dedicados: o SQL extraido e exatamente o que o bash entrega ao psql');
console.log('[PASS] shell disfarcado de SQL, forma nao declarada e versao invalida sao recusados');
NODE

printf '\n[OK] runtime-contract-runner: defeito (Bash enviado como SQL; sem fallback) e correcao provados\n'
