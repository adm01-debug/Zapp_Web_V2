# Dossiê — `claude/fix-ga-fase1-lote-banco-261020-2200` (PR #2125)

- Tip `19c48a20c` · merge-base `d7af7a671` · 1 commit · 8 arquivos (+210/−31) · workflows 2, scripts 6, src/edge/migration 0.
- Triagem anterior (2026-11-08) dizia OBSOLETA; dossiê arquivado `docs/_arquivo/analise-prs/dossies/PR-2125.md` = "NÃO VERIFICADO" (bloqueado por CI). **Ambos refutados abaixo.**

## Propósito
Fase 1 do `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md` (lote banco):
- **GA19 (P1)**: `check-migration-drift.mjs` passa a sair **3** só quando há migrations no disco sem registro no ledger e nada mais; **2 volta a ser só erro de infra**. `lote-pendente.mjs`, `db-live-guard.yml` e `types-sync.yml` testam `-eq 3`. Testes reais (psql falso).
- **GA18 (P3)**: `run-runtime-contract.mjs` confina o `-f` do contrato ao repo (`resolve` + prefixo da raiz + `.sql`); teste de traversal.
- **GA26 (prepare)**: `--json` em `check-migration-drift.mjs` emite `{ok, linhas:[{version,disco,ledger,classe}]}`; log humano vai a stderr.

## Estado da main hoje (prova) — a cadeia "apply pendente" está QUEBRADA e fail-open
- `origin/main:scripts/db-audit/check-migration-drift.mjs`: **0 ocorrências** de `classificar` e **0** de `return 3` (`git show origin/main:… | grep -c`). Só retorna 2 em falha de leitura de evidências (`:942`) e falha ao consultar o ledger (`:965`); arquivo sem registro no banco → `return 1` (`:987`, "FALHA: drift de migrations detectado").
- O `--classificar` (W21, `4dadbb74d`, 8 ocorrências) foi **removido** no lote `9c0a82cf4`/`025d0258d` (2026-10-16) e nunca voltou; já estava ausente no merge-base `d7af7a671`.
- `origin/main:scripts/db-audit/lote-pendente.mjs:49` ainda passa `--classificar` (ignorado: o script não lê `process.argv`) e `:61` trata `rc === 2` como "apply aguardado".
- `origin/main:.github/workflows/db-live-guard.yml:155`: `if [ "$rc" -eq 2 ] && push → exit 0` (verde). `origin/main:.github/workflows/types-sync.yml:342`: `if [ "$drift_exit" -eq 2 ] → awaiting_apply=true`.
- Consequência real: **falha de autenticação/conexão com o ledger (exit 2) vira "apply pendente" verde no push e `awaiting_apply=true` no types-sync**; e apply pendente legítimo (exit 1) é reportado como drift real. É exatamente o cenário "reproduzido" do GA19 no plano (`PLANO…:163-165`), ainda vigente.
- `origin/main:scripts/db-audit/run-runtime-contract.mjs:274-284`: `-f` só checa `existsSync(invocacao.arquivo)` (relativo ao cwd) e passa o caminho cru ao psql-safe; sem confinamento à raiz do repo. (O `-f` em comentário dentro de `-c "…"` já é ignorado pelo parser inline `:160-176` — comportamento igual ao da branch; NÃO VERIFICADO por execução.)
- `origin/main:scripts/ci/db-migrate-contratos.unit.mjs`: nenhum teste de traversal/`fora do repo` (grep vazio); #2795 só adicionou testes W28 de `validate-*-runtime`.
- `check-migration-drift.test.mjs:575-579` e `:1226-1230` na main ainda esperam `status 1` para `ledger: []`; `lote-pendente.test.mjs:95` ainda testa exit 2; nenhum teste real com psql falso.
- Nenhum commit da main desde o merge-base tocou `lote-pendente.*`/`run-runtime-contract.mjs`/`check-migration-drift.mjs` com esse propósito (`git log d7af7a67..origin/main -- …` = só `edd2ae3df` no unit test, `0601e3b64`/`c543c6ade`/`45d3a7c0c` no drift sem exit 3).

## Tabela arquivo × achado
| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/db-live-guard.yml` | PERDIDA (`-eq 2` → `-eq 3`) | main `:155` ainda `-eq 2` |
| `.github/workflows/types-sync.yml` | PERDIDA (`-eq 2` → `-eq 3`; comentário) | main `:342` ainda `-eq 2`; passo moveu para id `apply-pending` (`:335-347`) — portar no local novo |
| `scripts/db-audit/check-migration-drift.mjs` | PERDIDA (pendingOnly/exit 3, `--json`) | main sem `return 3`, sem `--json`, `compare()` retorna 4 campos (`:915`) |
| `scripts/db-audit/check-migration-drift.test.mjs` | PERDIDA (3 testes + `argv` no `runGuard`) | main `:575`, `:1226` esperam 1; sem GA19/GA26 |
| `scripts/db-audit/lote-pendente.mjs` | PERDIDA (`rc === 3`, docstring) | main `:61` `rc === 2` |
| `scripts/db-audit/lote-pendente.test.mjs` | PERDIDA (exit 3 + 2 testes reais `runRealLote`) | main `:95` exit 2; sem `runRealLote` |
| `scripts/db-audit/run-runtime-contract.mjs` | PERDIDA (confinamento `-f`) | main `:274-284` sem `resolve`/raiz |
| `scripts/ci/db-migrate-contratos.unit.mjs` | PERDIDA (2 testes GA18) | grep `traversal|fora do repo` vazio na main |

## Veredito: **PERDIDA_TOTAL** · confiança alta · `apagar_branch_seguro=false`
Nada do trabalho útil está na main. GA19 = valor **alto** (guard de banco do CI hoje fica verde em falha de infra). GA18 = médio. GA26 = baixo (prepare).

Sobreposição: variantes de GA19 também vivem em `pr/1930` (`claude/w21-classificar-migration-drift`, tip `1b904f6a1`, tem `--classificar` + `--json`), `pr/2108`/`pr/2502` (`a2f24e671`), `pr/2040`/`pr/2537` (`0d14ed8ae`). Recuperar UMA vez, num pacote só; a desta branch é a mais enxuta (sem `--classificar`, exit 3 incondicional via `pendingOnly`).

Atenção ao portar: `check-migration-drift.mjs` na main ganhou E53 (`45d3a7c0c`: `pendingStatus`, `DIVERGENCE_LINE_RE`, resumo no stdout) e `0601e3b64`; o hunk `main()` abaixo precisa ser reencaixado após `const result = compare(...)` (`:976`) e antes do bloco `if (result.errors.length)` (`:977`). Ao emitir `--json`, as linhas E53 de stdout (`:981-982`) devem ir a stderr (a branch resolve com `console.log = console.error` no topo do `main()`; `process.stdout.write` fica só com o JSON).

## Hunks essenciais (porte)

### `scripts/db-audit/check-migration-drift.mjs`
```diff
@@ compare(): contadores
   let pinnedWithoutHistoricalContent = 0;
+  let malformedNames = 0;
   for (const record of records) {
     if (typeof record.name === 'string'
         && (record.name !== record.name.trim() || /[\0-\x1f\x7f]/u.test(record.name))) {
       errors.push(`name malformado no ledger para ${record.version}`);
+      malformedNames += 1;
     }
   }
@@ compare(): retorno
-  return { errors, warnings, verifiedEvidence, pinnedWithoutHistoricalContent };
+  // GA19: "so apply pendente" = versions no disco sem ledger, NENHUM registro sem arquivo,
+  // nenhum outro erro. O bloco de presenca empurra 1 + 2 linhas por version pendente.
+  const pendingApply = withoutRecord.map(({ version }) => version);
+  const externalOnly = withoutFile.map(({ version }) => version);
+  const pendingOnly = pendingApply.length > 0
+    && externalOnly.length === 0
+    && malformedNames === 0
+    && errors.length === 1 + 2 * pendingApply.length;
+  return { errors, warnings, verifiedEvidence, pinnedWithoutHistoricalContent,
+    pendingApply, externalOnly, pendingOnly };
@@ main(): topo
 function main() {
+  // GA26 (prepare): --json leva SO JSON ao stdout; o log humano vai a stderr.
+  if (process.argv.includes('--json')) console.log = console.error;
@@ main(): apos compare()
+  const asJson = process.argv.includes('--json');
   const result = compare(local.migrations, parsed.records, local.exceptionsByVersion);
+  if (asJson) {
+    const linhas = [
+      ...result.pendingApply.map((version) => {
+        const m = local.migrations.find((x) => x.version === version);
+        return { version, disco: m ? m.fileName : null, ledger: null, classe: 'apply-pendente' };
+      }),
+      ...result.externalOnly.map((version) => {
+        const r = parsed.records.find((x) => x.version === version);
+        return { version, disco: null, ledger: r ? r.name : null, classe: 'ddl-fora-do-git' };
+      }),
+    ];
+    process.stdout.write(JSON.stringify({ ok: result.errors.length === 0, linhas }) + '\n');
+  }
   if (result.errors.length) {
+    if (result.pendingOnly) {
+      console.error('\nAVISO: somente apply pendente (exit 3) — migrations no disco sem registro no ledger; sem drift real.');
+      printDriftErrors(result.errors);
+      return 3;
+    }
     console.error('\nFALHA: drift de migrations detectado:');
```

### `scripts/db-audit/lote-pendente.mjs`
```diff
-  } else if (rc === 2) {
-    // W21: --classificar retorna 2 para apply-pendente (neutro)
+  } else if (rc === 3) {
+    // GA19: somente apply-pendente; exit 2 e erro e cai no ramo "drift real" (falha fechada).
```
Docstring: exit 1 drift real · exit 2 erro de infra · exit 3 só apply-pendente; chamadores aplicam política sobre 3. (Opcional: remover o `'--classificar'` morto em `:49` — o drift.mjs não lê argv.)

### `.github/workflows/db-live-guard.yml` (`:155`)
```diff
-          if [ "$rc" -eq 2 ] && [ "$GITHUB_EVENT_NAME" = "push" ]; then
+          if [ "$rc" -eq 3 ] && [ "$GITHUB_EVENT_NAME" = "push" ]; then
```
### `.github/workflows/types-sync.yml` (`:342`, passo `apply-pending`)
```diff
-          if [ "$drift_exit" -eq 2 ]; then
+          if [ "$drift_exit" -eq 3 ]; then
```
Comentário: `exit 0 = sem drift, exit 1 = drift real, exit 2 = erro de infra, exit 3 = so apply-pendente`.

### `scripts/db-audit/run-runtime-contract.mjs`
```diff
-import { dirname, join } from 'node:path';
+import { dirname, join, resolve, sep } from 'node:path';
@@ principal()
-  if (invocacao.arquivo && !existsSync(invocacao.arquivo)) {
-    console.error(`::error::contrato de runtime ausente no disco: ${invocacao.arquivo}`);
-    process.exit(2);
+  // GA18: o -f do contrato nunca escapa do repo (.sql, sem traversal).
+  let arquivoConfinado = null;
+  if (invocacao.arquivo) {
+    const RAIZ = dirname(dirname(AQUI));
+    const resolvido = resolve(RAIZ, invocacao.arquivo);
+    if (!resolvido.startsWith(RAIZ + sep) || !resolvido.endsWith('.sql')) {
+      console.error(`::error::contrato com -f fora do repo: ${invocacao.arquivo}`);
+      process.exit(2);
+    }
+    if (!existsSync(resolvido)) {
+      console.error(`::error::contrato de runtime ausente no disco: ${invocacao.arquivo}`);
+      process.exit(2);
+    }
+    arquivoConfinado = resolvido;
   }
@@
-  const args = invocacao.arquivo
-    ? [...invocacao.flags, '-f', invocacao.arquivo]
+  const args = arquivoConfinado
+    ? [...invocacao.flags, '-f', arquivoConfinado]
     : [...invocacao.flags, '-c', invocacao.sql];
```

### Testes (colar do diff da branch: `git diff d7af7a671 19c48a20c -- <arquivo>`)
- `scripts/db-audit/check-migration-drift.test.mjs`: `runGuard` ganha `argv = []` e `spawnSync(process.execPath, [SCRIPT, ...argv], …)`; testes `ledger: []` (`:575`, `:1226` na main) passam a esperar `status 3` + `/somente apply pendente/`; novos: `GA19: falha de autenticacao no ledger sai 2, nunca 3` (`psqlFailCount: 1, psqlFailMessage: 'FATAL: password authentication failed…', retryDelaysMs: ''` → status 2, `/FALHA: falha ao consultar schema_migrations/`, `doesNotMatch /apply pendente/`) e `GA26 (prepare): --json` (`runGuard({ ledger: [], argv: ['--json'] })` → status 3, `JSON.parse(stdout)` = `{ok:false, linhas:[{version, disco: FILE, ledger: null, classe:'apply-pendente'}]}`).
- `scripts/db-audit/lote-pendente.test.mjs`: mock e teste `exit 3 → "apply aguardado"`; novo helper `runRealLote({files, psqlOutput, psqlExit})` (tmpdir com `migrations/`, `fake-psql.mjs` que escreve `FAKE_PSQL_OUTPUT` e sai `psqlExit`, `migration-evidence.json` `{schema_version:2, exceptions:[]}`, env `MIGRATIONS_DIR`, `MIGRATION_EVIDENCE_PATH`, `PSQL_BIN`, `LEDGER_RETRY_DELAYS_MS=''`, `DESTINO_URL='postgres://tester@fixture.invalid/test'`, `GITHUB_STEP_SUMMARY`) e 2 testes: fixture `20260829050000_create_demo.sql` sem ledger → exit 3 + "apply aguardado"; psql falso `exit 1` → rc ∉ {0,3} e summary "drift real". Confirmar na main que `check-migration-drift.mjs` ainda honra `MIGRATIONS_DIR`/`MIGRATION_EVIDENCE_PATH`/`PSQL_BIN`/`LEDGER_RETRY_DELAYS_MS` antes de portar (NÃO VERIFICADO aqui).
- `scripts/ci/db-migrate-contratos.unit.mjs`: `GA18: -f escrito em comentario … ignorado` (`extrairInvocacoes` com `SELECT 1 -- -f scripts/db-audit/evil.sql` → `inv.arquivo === null`) e `GA18: -f com traversal sai com 2` (`rodaExecutor` com `-f ../evil.sql` → status 2, stdout vazio, `/::error::contrato com -f fora do repo/`). Helpers `rodaExecutor`, `mkdtempSync`, `rmSync` já existem na main (`:3`, `:86`).

## Verificação ao recuperar
`node --test scripts/db-audit/check-migration-drift.test.mjs scripts/db-audit/lote-pendente.test.mjs scripts/ci/db-migrate-contratos.unit.mjs` e `node --test scripts/ci/*.unit.mjs`; run do `db-live-guard` em push após o merge deve sair 0 com `::warning::Apply pendente` (não issue), e com credencial inválida deve sair 2 (vermelho).

## Verificação adversarial

Tentei refutar o PERDIDA_TOTAL procurando a entrega em `origin/main` (tip `dac285f62`) e um motivo de descarte deliberado. **Não achei: a triagem está correta e, em dois pontos, subestimada.**

### A lacuna não está na main (checado por mim)
- `origin/main:scripts/db-audit/check-migration-drift.mjs`: `grep -c` = **0** para `return 3`, `pendingOnly`, `pendingApply`, `externalOnly`, `malformedNames`, `--json`, `classificar` e `somente apply pendente`. O script **não lê `process.argv`** (grep vazio). Os únicos `return 2` são `:942` (ler migrations/evidências) e `:965` (consultar ledger) — ambos infra; arquivo sem registro no ledger cai em `:986 return 1`.
- `origin/main:.github/workflows/db-live-guard.yml:155` = `if [ "$rc" -eq 2 ] && [ "$GITHUB_EVENT_NAME" = "push" ]` → `exit 0` (único `-eq N` do arquivo). `origin/main:.github/workflows/types-sync.yml:342` = `if [ "$drift_exit" -eq 2 ]` → `awaiting_apply=true` (passo `apply-pending`, `:334-347`).
- `origin/main:scripts/db-audit/run-runtime-contract.mjs`: `:31` importa só `{ dirname, join }`; `:274-277` só `existsSync(invocacao.arquivo)` e `:284-286` passa o caminho cru ao psql-safe. `scripts/db-audit/psql-safe.mjs` (58 linhas) **não** confina `-f` (grep por `resolve(`/`startsWith`/`.sql` = nada além de um comentário) — logo GA18 não foi coberto em outra camada.
- `origin/main:scripts/ci/db-migrate-contratos.unit.mjs`: `grep -c 'traversal|fora do repo'` = **0**; `extrairInvocacoes` (`:12`) e `rodaExecutor` (`:86`) existem, então os 2 testes GA18 encaixam sem helper novo.

### Não foi removido de propósito (é perda colateral)
- `--classificar` entrou em `4dadbb74d` (W21/W50) e saiu em `9c0a82cf4` → revert `312bd5992` ("main não compilava") → resubmissão `025d0258d` ("lote 880 cartões + fixes F1–F6"), cujo diff de `check-migration-drift.mjs` apaga `const classificar = process.argv.includes('--classificar')` e o `return 2` de apply-pendente **sem tocar em `lote-pendente.mjs`**. Prova da perda acidental: a main **ainda passa a flag morta** (`lote-pendente.mjs:49`) e ainda documenta/trata `exit 2 = apply-pendente` (`:5-14`, `:61`), contrato que o script chamado já não cumpre. Nenhuma mensagem de commit de `9c0a82cf4`/`025d0258d`/`312bd5992` justifica desativar a classificação.
- `git log d7af7a671..origin/main` nos 8 arquivos: `0601e3b64`, `c543c6ade`, `45d3a7c0c` (drift), `edd2ae3df` (unit, W28), bumps de action e `ac97c0ea3`/`49a0a6b3d` (types-sync) — nenhum com exit 3, `--json` ou confinamento de `-f`.
- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:160,163,186`: GA18, GA19 e GA26 seguem `[ ]`.

### O trabalho ainda encaixa na main
- `compare()` mantém `withoutRecord` (`:629`) e `withoutFile` (`:630`) e o push de `name malformado` (`:637-638`), insumos exatos do `pendingOnly`; `printDriftErrors` (`:929`) existe; o retorno de 4 campos está em `:916`.
- Resolve o "NÃO VERIFICADO" da triagem: a main honra **todas** as envs do helper `runRealLote` — `MIGRATIONS_DIR` (`:28`), `MIGRATION_EVIDENCE_PATH` (`:29`), `PSQL_BIN` (`:31`), `DESTINO_URL` (`:32`), `LEDGER_RETRY_DELAYS_MS` (`:522`).

### Onde a triagem foi conservadora
1. O fail-open é real e o gate de credencial **não** o cobre: o passo `credencial` do `db-live-guard` só valida formato de URL/TLS/CA (`database-identity.mjs`), nunca conecta. Falha de autenticação ou de conexão no `psql` do ledger ocorre depois → `return 2` (`:965`) → `rc 2` → `-eq 2 && push` → **job verde com `::warning::Apply pendente`**.
2. Há um segundo defeito presente, não listado: apply-pendente **legítimo** hoje sai **1**, então todo push que mergeia lote de migration deixa o `db-live-guard` vermelho e escreve "drift real detectado" no summary (`lote-pendente.mjs:73`) — o oposto do que W26 pretendia.

### Parecer
`concorda=true` · `veredito_final=PERDIDA_TOTAL` · `apagar_branch_seguro=false`. Recuperar GA19 num pacote único (ver sobreposição com `pr/1930`, `pr/2108`/`2502`, `pr/2040`/`2537`); ao portar, remover também a flag morta `'--classificar'` de `lote-pendente.mjs:49`, senão o contrato do chamador continua mentindo. Não executei os testes da branch (sem `node --test` aqui): o encaixe é por leitura, **NÃO VERIFICADO** por execução.
