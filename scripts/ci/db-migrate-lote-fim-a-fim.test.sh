#!/usr/bin/env bash
# Prova que um LOTE de migrations atravessa o db-migrate.yml de ponta a ponta:
# o preflight aceita, o passo de contrato/runtime resolve pelo contrato
# generico (a versao alvo do lote nao tem contrato dedicado) e a saida do
# dry-run e validada — tudo com ledger e saida simulados em arquivo, sem banco
# e sem executar o workflow.
#
# Cobre a recusa da rodada anterior: o lote passava no preflight mas o workflow
# abortava no passo de runtime (versao sem contrato dedicado -> exit 2), ou
# seja, a funcionalidade nao funcionava de ponta a ponta.
#
# Nao precisa de docker nem de Postgres — roda em qualquer runner.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

preflight="scripts/ci/db-migrate-preflight-scope.sh"
runner="scripts/db-audit/run-runtime-contract.mjs"
dryrun="scripts/db-audit/dry-run-plan.mjs"
workflow=".github/workflows/db-migrate.yml"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
passed=0

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

# ── Ledger simulado a partir do repositorio de verdade ───────────────────────
# Versions locais reais (14 digitos, ordenadas); o "lote do dia" sao as 8
# ultimas e o ledger remoto e tudo que ficou para tras. O alvo e a ponta.
find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
  | cut -c1-14 | sort -u > "$tmp/local"
mapfile -t LOTE < <(tail -n 8 "$tmp/local")
[ "${#LOTE[@]}" = "8" ] || fail "o repositorio precisa ter ao menos 8 versions locais; achei ${#LOTE[@]} no lote"
ALVO="${LOTE[7]}"
printf '%s\n' "${LOTE[@]}" > "$tmp/lote"
comm -23 "$tmp/local" "$tmp/lote" > "$tmp/remote"
LOTE_CSV="$(paste -sd, "$tmp/lote")"
[ ! -f "scripts/db-audit/contracts/${ALVO}.sql" ] \
  || fail "o alvo do teste ($ALVO) precisa ser uma version SEM contrato dedicado"

# ── a) Preflight: sem --lote falha (o defeito); com --lote liga o bundle ─────
set +e
bash "$preflight" --local "$tmp/local" --remote "$tmp/remote" \
  --alvo "$ALVO" --lote '' >"$tmp/a.out" 2>"$tmp/a.err"
st=$?
set -e
[ "$st" != "0" ] || fail "preflight sem lote tinha de falhar"
grep -q 'missing_count=8' "$tmp/a.err" \
  || fail "esperava missing_count=8; stderr: $(cat "$tmp/a.err")"
passed=$((passed + 1))
printf '[PASS] sem lote: preflight falha com missing_count=8 (o defeito original)\n'

set +e
out="$(bash "$preflight" --local "$tmp/local" --remote "$tmp/remote" \
  --alvo "$ALVO" --lote "$LOTE_CSV" 2>"$tmp/a2.err")"
st=$?
set -e
if [ "$st" != "0" ]; then
  cat "$tmp/a2.err" >&2
  fail "lote de 8 tinha de passar no preflight"
fi
printf '%s\n' "$out" | grep -Fxq 'needs_apply=true' || fail "esperava needs_apply=true, recebi: $out"
printf '%s\n' "$out" | grep -Fxq 'apply_bundle=true' || fail "esperava apply_bundle=true, recebi: $out"
passed=$((passed + 1))
printf '[PASS] lote de 8 aceito: needs_apply=true, apply_bundle=true\n'

# ── b) Contrato/runtime: alvo sem dedicado resolve para o generico ───────────
origem_caminho="$(node --input-type=module -e "
import { resolverContrato } from './scripts/db-audit/run-runtime-contract.mjs';
const r = resolverContrato('$ALVO', { permitirGenerico: true });
console.log(r.origem + ' ' + r.caminho);
")"
case "$origem_caminho" in
  "generico "*generic-migration-runtime.sql) ;;
  *) fail "resolverContrato($ALVO, permitirGenerico) tinha de devolver origem=generico e o generic-migration-runtime.sql; recebi: $origem_caminho" ;;
esac
passed=$((passed + 1))
printf '[PASS] alvo sem dedicado resolve para o contrato generico\n'

msg="$(node --input-type=module -e "
import { resolverContrato } from './scripts/db-audit/run-runtime-contract.mjs';
try { resolverContrato('$ALVO'); console.log('RESOLVEU'); }
catch (e) { console.log('LANCOU: ' + e.message); }
")"
printf '%s' "$msg" | grep -q 'RESOLVEU' \
  && fail "resolverContrato($ALVO) sem o flag resolveu sem contrato"
printf '%s' "$msg" | grep -q 'contrato de runtime ausente' \
  || fail "resolverContrato($ALVO) sem flag tinha de lancar 'contrato de runtime ausente'; recebi: $msg"
passed=$((passed + 1))
printf '[PASS] sem o flag o alvo continua fail-closed (contrato ausente)\n'

origem_ded="$(node --input-type=module -e "
import { resolverContrato } from './scripts/db-audit/run-runtime-contract.mjs';
console.log(resolverContrato('20260830170000', { permitirGenerico: true }).origem);
")"
[ "$origem_ded" = "dedicado" ] \
  || fail "versao com dedicado tinha de devolver origem=dedicado mesmo com permitirGenerico; recebi: $origem_ded"
passed=$((passed + 1))
printf '[PASS] contrato dedicado tem precedencia absoluta sobre o generico\n'

# O flag do CLI e o mesmo caminho que o workflow chama: sem ele sai exit 2 sem
# stdout; com ele a resolucao passa e o aviso do generico vai para o stderr.
set +e
node "$runner" "$ALVO" >"$tmp/b.out" 2>"$tmp/b.err"
st=$?
set -e
[ "$st" = "2" ] || fail "CLI sem flag tinha de sair exit 2 (saiu $st)"
[ ! -s "$tmp/b.out" ] || fail "CLI sem flag nao pode imprimir nada em stdout"
set +e
node "$runner" "$ALVO" --generico-se-ausente >"$tmp/b2.out" 2>"$tmp/b2.err"
st=$?
set -e
grep -q "sem contrato dedicado para $ALVO; usando o contrato runtime generico." "$tmp/b2.err" \
  || fail "CLI com --generico-se-ausente tinha de avisar o fallback no stderr; recebi: $(cat "$tmp/b2.err")"
passed=$((passed + 1))
printf '[PASS] flag --generico-se-ausente conecta o CLI ao fallback (exit 2 sem, aviso com)\n'

# ── c) Dry-run: a saida simulada do lote e validada pelo verificador real ────
{
  echo 'DRY RUN: migrations will *not* be pushed to the database.'
  for v in "${LOTE[@]}"; do
    f="$(find supabase/migrations -maxdepth 1 -type f -name "${v}_*.sql" -printf '%f\n' | head -n1)"
    [ -n "$f" ] || fail "version $v do lote nao tem arquivo local"
    echo "Would push migration ${f}..."
  done
} > "$tmp/dry-run.out"

node "$dryrun" --arquivo "$tmp/dry-run.out" --esperado "$ALVO" --exatos "$LOTE_CSV" >/dev/null \
  || fail "o dry-run do lote valido tinha de sair exit 0 no modo --exatos"
passed=$((passed + 1))
printf '[PASS] dry-run do lote valido validado no modo de conjunto exato (exit 0)\n'

head -n -1 "$tmp/dry-run.out" > "$tmp/dry-run-div.out"
set +e
node "$dryrun" --arquivo "$tmp/dry-run-div.out" --esperado "$ALVO" --exatos "$LOTE_CSV" >/dev/null 2>"$tmp/d.err"
st=$?
set -e
[ "$st" = "1" ] || fail "dry-run divergente (lote sem a ultima version) tinha de sair exit 1 (saiu $st)"
grep -q 'Dry-run recusado' "$tmp/d.err" \
  || fail "dry-run divergente sem mensagem clara; stderr: $(cat "$tmp/d.err")"
grep -q 'lote autorizado' "$tmp/d.err" \
  || fail "a recusa tinha de citar o lote autorizado; stderr: $(cat "$tmp/d.err")"
passed=$((passed + 1))
printf '[PASS] dry-run divergente (sem a ultima version) bloqueado com mensagem clara\n'

# Recusa que a rodada anterior pediu: uma migration INTERMEDIARIA omitida do
# plano tem de ser bloqueada — so conferir o alvo da ponta nao basta.
grep -v "${LOTE[4]}_" "$tmp/dry-run.out" > "$tmp/dry-run-int.out"
set +e
node "$dryrun" --arquivo "$tmp/dry-run-int.out" --esperado "$ALVO" --exatos "$LOTE_CSV" >/dev/null 2>"$tmp/int.err"
st=$?
set -e
[ "$st" = "1" ] || fail "dry-run com a 5a migration do lote omitida tinha de sair exit 1 (saiu $st)"
grep -q 'lote autorizado' "$tmp/int.err" \
  || fail "a recusa tinha de citar o lote autorizado; stderr: $(cat "$tmp/int.err")"
grep -q "${LOTE[4]}" "$tmp/int.err" \
  || fail "a recusa tinha de nomear a version omitida (${LOTE[4]}); stderr: $(cat "$tmp/int.err")"
passed=$((passed + 1))
printf '[PASS] dry-run com migration intermediaria omitida bloqueado\n'

# ── d) Guardas: o flag do generico so existe dentro do ramo modo=lote ────────
# O desenho novo restringe --generico-se-ausente ao lote explicito e validado:
# fora dele o runner vai SEM o flag e segue fail-closed. Os greps prendem o
# desenho inteiro, nao so a presenca do flag.
grep -Fq 'SCOPE_MODE: ${{ steps.preflight.outputs.modo }}' "$workflow" \
  || fail "o passo de runtime nao recebe o modo decidido pelo preflight (SCOPE_MODE)"
trecho_runtime="$(awk '/id: runtime/{f=1} f{print} /- name: Dry-run oficial do Supabase CLI/{f=0}' "$workflow")"
printf '%s\n' "$trecho_runtime" | grep -Fq 'if [ "${SCOPE_MODE:-}" = "lote" ]; then' \
  || fail "o passo de runtime nao condiciona o flag ao modo lote"
ramo_lote="$(printf '%s\n' "$trecho_runtime" | sed -n '/SCOPE_MODE.*= "lote"/,/else/p')"
printf '%s\n' "$ramo_lote" | grep -Fq -- '--generico-se-ausente' \
  || fail "o ramo lote perdeu o flag --generico-se-ausente"
ramo_else="$(printf '%s\n' "$trecho_runtime" | sed -n '/^ *else/,/fi/p')"
printf '%s\n' "$ramo_else" | grep -Fq 'run-runtime-contract.mjs "$TARGET_VERSION")' \
  || fail "o ramo else nao chama o runner fail-closed (sem o flag)"
printf '%s\n' "$ramo_else" | grep -q -- '--generico-se-ausente' \
  && fail "o flag --generico-se-ausente vazou para fora do ramo lote"
grep -q "proof.contract === 'generic'" "$workflow" \
  || fail "o braco proof.contract === 'generic' sumiu do workflow"
grep -q "process\.env\.APPLY === 'true' && confirmacao !== process\.env\.CONFIRM_RUNTIME_SHA256" "$workflow" \
  || fail "a comparacao de confirmacao condicionada ao apply sumiu ou mudou"
grep -Fq 'ESPERADOS: ${{ steps.preflight.outputs.esperados }}' "$workflow" \
  || fail "o passo do dry-run nao recebe o conjunto exato esperado"
grep -Fq 'dry-run-plan.mjs --arquivo dry-run.out --esperado "$TARGET_VERSION" --exatos "$ESPERADOS"' "$workflow" \
  || fail "o passo do dry-run nao confere o conjunto exato (--exatos)"
passed=$((passed + 1))
printf '[PASS] guardas do workflow: flag restrito ao modo lote, else fail-closed, dry-run em conjunto exato\n'

# ── e) O passo real do workflow, executado, completa para o alvo do lote ─────
# O cenario (b) prova a decisao de contrato; aqui executa-se o passo do workflow
# como o runner do GitHub faria. O banco e' dublado ($tmp/stub-psql) porque um
# runner de CI nao pode apontar para producao, e o SQL do contrato generico tem
# teste proprio contra Postgres descartavel
# (scripts/db-audit/generic-migration-runtime.test.sh, no db-guard.yml). O que
# se prende aqui e' o que a recusa apontou: para uma version do lote SEM
# contrato dedicado, o passo "Provar estado runtime antes do push" ia a exit 2
# com o runner do E62 e agora chega ao fim.
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
const doc = parse(readFileSync('$workflow', 'utf8'));
const passo = doc.jobs.migrate.steps.find((s) => s.id === 'runtime');
writeFileSync('$tmp/runtime-step.sh', passo.run);
"
[ -s "$tmp/runtime-step.sh" ] || fail 'nao consegui extrair o passo id=runtime do workflow'

cat > "$tmp/stub-psql" <<'STUB'
#!/usr/bin/env bash
# psql dublado: devolve o payload do contrato runtime generico, sem banco.
cat <<'JSON'
{"server_major": 17, "database": "postgres", "contract": "generic", "table_count": 42, "function_count": 118, "policy_count": 55, "ledger_count": 781, "structure_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "runtime_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
JSON
exit 0
STUB
chmod +x "$tmp/stub-psql"

# run_passo_runtime <arquivo-do-passo>: repete o ambiente que o passo declara.
# SCOPE_MODE=lote e' o que o workflow injeta quando o preflight decide lote;
# outro valor (ou ausencia) simula os demais modos e tem de seguir fail-closed.
run_passo_runtime() {
  DESTINO_URL='postgresql://dublado:dublado@127.0.0.1:1/dublado'   PSQL_BIN="$tmp/stub-psql"   TARGET_VERSION="$ALVO" APPLY=false NEEDS_APPLY=true APPLY_BUNDLE=true   SCOPE_MODE="${SCOPE_MODE:-lote}"   CONFIRM_RUNTIME_SHA256='' GITHUB_SHA="$(git rev-parse HEAD)"   GITHUB_OUTPUT="$tmp/gh-out.txt" GITHUB_ENV="$tmp/gh-env.txt"   bash "$1"
}

set +e
out_e="$(run_passo_runtime "$tmp/runtime-step.sh" 2>&1)"
st_e=$?
set -e
if [ "$st_e" != "0" ]; then
  printf '%s
' "$out_e" >&2
  fail "o passo de runtime do workflow tinha de completar para o alvo do lote (saiu $st_e)"
fi
printf '%s' "$out_e" | grep -q 'Contrato generico'   || fail "o passo nao registrou o contrato generico; saida: $out_e"
passed=$((passed + 1))
printf '[PASS] passo real do workflow completa para o alvo do lote (contrato generico)
'

sed 's/ --generico-se-ausente//' "$tmp/runtime-step.sh" > "$tmp/runtime-step-sem-flag.sh"
set +e
out_f="$(run_passo_runtime "$tmp/runtime-step-sem-flag.sh" 2>&1)"
st_f=$?
set -e
[ "$st_f" != "0" ] || fail "sem o flag o passo de runtime nao podia completar (defeito do E62 nao reproduzido)"
printf '%s' "$out_f" | grep -q 'contrato de runtime ausente'   || fail "sem o flag a falha tinha de ser 'contrato de runtime ausente'; saida: $out_f"
passed=$((passed + 1))
printf '[PASS] sem o flag o passo real do workflow aborta (defeito do E62 reproduzido)
'

# O mesmo alvo sem contrato dedicado, mas com o preflight decidindo outro modo:
# o flag e' exclusivo do lote — fora dele o passo segue fail-closed.
set +e
out_g="$(SCOPE_MODE=alvo-unico run_passo_runtime "$tmp/runtime-step.sh" 2>&1)"
st_g=$?
set -e
[ "$st_g" != "0" ] || fail "fora do modo lote o passo de runtime nao podia completar para alvo sem contrato"
printf '%s' "$out_g" | grep -q 'contrato de runtime ausente' \
  || fail "fora do modo lote a falha tinha de ser 'contrato de runtime ausente'; saida: $out_g"
passed=$((passed + 1))
printf '[PASS] fora do modo lote o passo segue fail-closed (flag exclusivo do lote)
'

printf 'db-migrate-lote-fim-a-fim: %s cenarios aprovados.\n' "$passed"
