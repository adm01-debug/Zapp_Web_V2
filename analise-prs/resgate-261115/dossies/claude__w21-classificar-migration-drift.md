# Dossiê — `claude/w21-classificar-migration-drift` (PR #1930)

- ref: `origin/claude/w21-classificar-migration-drift` · tip `1b904f6a1` · merge_base `1252bb5a4` (2026-11-01)
- 15 commits (10 são merges da main). 2 arquivos: `scripts/db-audit/check-migration-drift.mjs` (+171) e `scripts/db-audit/check-migration-drift.test.mjs` (+176).
- Triagem anterior (2026-11-08) marcou `DUPLICATA_PROVAVEL`. **Hipótese refutada** — ver provas.

## Propósito
Adicionar `--classificar` (e `--json`) ao `check-migration-drift.mjs`, classificando cada version em 4 classes
(`apply-pendente`, `ledger-sem-arquivo`, `conteudo-divergente`, `version-duplicada`) e separando o exit code:
**exit 2 = só apply-pendente (neutro)**, exit 1 = drift real, exit 0 = limpo.

## Achado central: a main depende do flag que não existe nela

| Evidência | Resultado |
|---|---|
| `git show origin/main:scripts/db-audit/check-migration-drift.mjs \| grep -c -i classificar` | **0** — o flag não existe na main |
| `origin/main:scripts/db-audit/lote-pendente.mjs:49` | `[DRIFT_SCRIPT, '--classificar', ...process.argv.slice(2)]` — a main **chama** o flag |
| `origin/main:scripts/db-audit/lote-pendente.mjs:62` | comentário `// W21: --classificar retorna 2 para apply-pendente (neutro)` |
| `origin/main:scripts/db-audit/check-migration-drift.mjs:934-1006` (`main()`) | retorna 2 **somente** em falha de leitura/consulta; apply-pendente cai em `result.errors` → **return 1** |
| `origin/main:.github/workflows/db-live-guard.yml:152-159` | `rc=$?` de `lote-pendente.mjs`; `if [ "$rc" -eq 2 ] && push → exit 0` (neutro) |
| `origin/main:.github/workflows/types-sync.yml:339-347` | `drift_exit -eq 2 → awaiting_apply=true` (pula gates de TS) |
| `origin/main:scripts/db-audit/check-triple-parity.mjs:181` | `'[migrations] delegada ao check-migration-drift.mjs --classificar'` |
| `git log --oneline -1 --diff-filter=A origin/main -- scripts/db-audit/lote-pendente.mjs` | `4dadbb74d ci(W50+...+W94): CI/CD score batch (#1942)` — o consumidor (W26) entrou na main **sem** o produtor (W21) |
| `origin/main:scripts/db-audit/lote-pendente.test.mjs:23-60` | o teste **reimplementa** o wrapper num script temporário (`runWithMock`) em vez de executar `lote-pendente.mjs`; nunca exercitou o flag → o furo passou sem detecção |

**Efeito hoje na main:** qualquer migration mergeada antes do apply do lote devolve exit 1 em
`lote-pendente.mjs`. O `db-live-guard` não reconhece o caso neutro (abre alerta/issue de drift falso em push)
e o `types-sync` nunca marca `awaiting_apply=true` (roda os gates de TypeScript contra schema que ainda não
foi aplicado). O contrato documentado nos dois workflows está quebrado na main.

## Arquivos

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/check-migration-drift.mjs` | `BOTH_CHANGED` / `ABSENT_APPLIES_CLEAN`, 116 linhas faltando | **PERDIDO** — `--classificar`, `--json`, `duplicateVersions`, `classifications`, `driftErrors`, exit 2 | grep acima = 0 ocorrências na main |
| `scripts/db-audit/check-migration-drift.test.mjs` | `BOTH_CHANGED` / `CONFLICT`, 118 linhas faltando | **PERDIDO** — 12 testes W21 (`scriptArgs`, 4 classes, `--json`, ramos de exceção) | `git show origin/main:...test.mjs \| grep -c -i 'scriptArgs\|classificar'` = **0** |

`removed_still_in_main` (19 + 3 linhas) é **churn da branch, não deve ser portado**: a branch troca em-dash `—`
por `--` em comentários/strings e degrada `\\.sql` → `\.sql` nos regex do teste (em template literal `\.` vira `.`).
A main está correta nesses pontos.

## Veredito: PERDIDA_TOTAL (valor alto)
Nada do trabalho útil está na main, não ficou obsoleto — ao contrário, a main **já tem o consumidor** e está
quebrada sem ele. Não é `DECISAO_DONO`: é script de CI, sem custo externo e sem contradizer regra vigente.

`apagar_branch_seguro = false`.

## Como portar (não dá cherry-pick)
A branch está 44 commits atrás no arquivo: `git diff --stat origin/main origin/claude/w21-...` mostra
288 linhas de diferença em `check-migration-drift.mjs` (a main evoluiu muito depois do merge_base).
**Reimplementar os hunks abaixo sobre `origin/main`**, mantendo os em-dashes e os `\\.` da main.

### 1. `parseLedger()` — expor versões duplicadas (main ~linha 617)
```js
  const duplicateVersions = [];
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.version)) {
      errors.push(`versao duplicada no ledger: ${record.version}`);
      duplicateVersions.push(record.version);
    }
    seen.add(record.version);
  }
  return { records: records.sort((a, b) => a.version.localeCompare(b.version)), errors, duplicateVersions };
```

### 2. `compare()` — assinatura + classificação (main linha 624)
```js
function compare(migrations, records, exceptionsByVersion, { duplicateVersions = [] } = {}) {
  ...
  const classifications = [];
```
No laço de `name malformado no ledger` (depois dos dois `errors.push`):
```js
      // W21: o name e' conteudo do ledger; sem esta linha o erro nao aparecia
      // em nenhuma classe e --classificar saia com exit 0.
      classifications.push({
        version: record.version,
        disco: byFileVersion.get(record.version)?.fileName ?? '-',
        ledger: JSON.stringify(record.name),
        classe: 'conteudo-divergente',
      });
```
Cercar o bloco `withoutRecord` (é a única classe não fatal):
```js
  const applyPendenteStart = errors.length;
  if (withoutRecord.length) { ...bloco existente... }
  const applyPendenteEnd = errors.length;
```
Depois do bloco de `withoutFile` / exceções:
```js
  for (const { version, fileName } of withoutRecord) {
    classifications.push({ version, disco: fileName, ledger: '-', classe: 'apply-pendente' });
  }
  for (const record of withoutFile) {
    const lname = record.name ? normalizeLedgerName(record.version, record.name) : '-';
    classifications.push({ version: record.version, disco: '-', ledger: lname, classe: 'ledger-sem-arquivo' });
  }
  for (const version of duplicateVersions) {
    classifications.push({ version, disco: '-', ledger: '-', classe: 'version-duplicada' });
  }
```
Dentro do laço `for (const migration of migrations)`, após `const ledgerName = ...` (main linha ~670 usa
`errorsBeforeMigration`, que já existe):
```js
    const classifyIfDiverged = () => {
      if (errors.length > errorsBeforeMigration) {
        classifications.push({
          version: migration.version,
          disco: migration.fileName,
          ledger: ledgerName ?? '-',
          classe: 'conteudo-divergente',
        });
      }
    };
```
**Chamar `classifyIfDiverged()` antes de CADA `continue`** dos ramos de exceção (comment-only, name-and-file-pinned,
pinned-replay — na main os `continue` estão perto das linhas 725, 749, 771) e no fim do laço. Sem isso, drift
real nesses ramos sai com exit 0 (é a regressão que os últimos 5 testes W21 cobrem).

Retorno de `compare()`:
```js
  const seenClass = new Set();
  const uniqueClassifications = classifications.filter((c) => {
    const key = `${c.version}\0${c.classe}`;
    if (seenClass.has(key)) return false;
    seenClass.add(key);
    return true;
  });
  // Tudo que nao e' apply-pendente e' drift: --classificar falha com qualquer um
  // destes, mesmo que (por um ramo futuro) ele nao tenha ganho classe.
  const driftErrors = errors.filter((_, i) => i < applyPendenteStart || i >= applyPendenteEnd);
  return { errors, driftErrors, warnings, verifiedEvidence, pinnedWithoutHistoricalContent,
           classifications: uniqueClassifications };
```

### 3. `main()` — flags, status bufferizado e exit code (main linha 934)
```js
  const argv = process.argv.slice(2);
  const classificar = argv.includes('--classificar');
  const jsonOutput = argv.includes('--json');
  ...
  const flushStatus = () => {
    if (!jsonOutput) for (const line of pendingStatus) console.log(line);
    pendingStatus.length = 0;
  };
```
Trocar todos os `for (const line of pendingStatus) console.log(line);` por `flushStatus()`.
Sem `DESTINO_URL` e com `--classificar --json`: imprimir `{"classificacoes":[],"totais":{...4 zeros},"erros":[]}` e `return 0`.
`parsed.errors` com `--classificar`: filtrar `versao duplicada no ledger: ` (vira classe, não aborta):
```js
  const parsedErrorsFiltrados = classificar
    ? parsed.errors.filter((e) => !e.startsWith('versao duplicada no ledger: '))
    : parsed.errors;
```
Chamar `compare(..., { duplicateVersions: parsed.duplicateVersions })` e, antes do bloco `if (result.errors.length)`:
```js
  if (classificar) {
    flushStatus();
    const drift = result.classifications.filter((c) => c.classe !== 'apply-pendente');
    if (jsonOutput) {
      const pendente = result.classifications.filter((c) => c.classe === 'apply-pendente');
      console.log(JSON.stringify({
        classificacoes: result.classifications.sort((a, b) => a.version.localeCompare(b.version)),
        totais: {
          'apply-pendente': pendente.length,
          'ledger-sem-arquivo': drift.filter((c) => c.classe === 'ledger-sem-arquivo').length,
          'conteudo-divergente': drift.filter((c) => c.classe === 'conteudo-divergente').length,
          'version-duplicada': drift.filter((c) => c.classe === 'version-duplicada').length,
        },
        erros: result.driftErrors,
      }, null, 2));
    } else {
      const rows = result.classifications.sort((a, b) => a.version.localeCompare(b.version));
      if (rows.length === 0) console.log('classificar: sem pendencias ou drift');
      else for (const c of rows) {
        console.log(`${c.version} | ${safeDivergenceName(c.disco)} | ${safeDivergenceName(c.ledger)} | ${c.classe}`);
      }
    }
    if (drift.length > 0 || result.driftErrors.length > 0) {
      if (!jsonOutput) {
        console.error(`\nFALHA (classificar): ${drift.length} item(ns) de drift real detectado(s)`);
        if (result.driftErrors.length) {
          console.error(`${result.driftErrors.length} erro(s) de drift:`);
          printDriftErrors(result.driftErrors);
        }
      }
      return 1;
    }
    // exit 2 para apply-pendente (neutro) -- lote-pendente.mjs usa este codigo
    return result.classifications.filter((c) => c.classe === 'apply-pendente').length > 0 ? 2 : 0;
  }
```

### 4. Testes — `scripts/db-audit/check-migration-drift.test.mjs`
`runGuard({ ..., scriptArgs = [] })` → `spawnSync(process.execPath, [SCRIPT, ...scriptArgs], {...})`.
Depois portar os 12 testes W21 da branch (`git diff 1252bb5a4 origin/claude/w21-classificar-migration-drift -- scripts/db-audit/check-migration-drift.test.mjs`):
4 classes isoladas, limpo→exit 0, `--json` válido, formato `version | disco | ledger | classe` (4 campos),
4 cenários de ramo de exceção com drift → `conteudo-divergente` exit 1, 3 exceções válidas → exit 0,
apply-pendente sozinho → exit 2 com `erros: []`.
**Não** copiar as 3 linhas de regex que a branch degrada (`\\.sql` → `\.sql`): manter o `\\.` da main.

### 5. Verificação
`node --test scripts/db-audit/check-migration-drift.test.mjs` e `node --test scripts/db-audit/lote-pendente.test.mjs`.
Vale também corrigir `lote-pendente.test.mjs` para executar de fato `lote-pendente.mjs` (hoje testa um wrapper
reimplementado e por isso não pegou a ausência do flag) — item separado, não bloqueia o port.

## Verificação adversarial

Parecer: **CONCORDO com PERDIDA_TOTAL** (tentei refutar e não consegui). Branch NÃO pode ser apagada.

### Provas de que a lacuna está mesmo na main
- `git show origin/main:scripts/db-audit/check-migration-drift.mjs | grep -i 'classificar\|classifications\|duplicateVersions\|applyPending'` → **0 ocorrências**. A main não parseia `process.argv` em `main()` (`origin/main:scripts/db-audit/check-migration-drift.mjs:934-1006`): o flag é silenciosamente ignorado e apply-pendente cai em `result.errors` → `return 1`.
- `git grep -i 'classificar\|apply-pendente' origin/main -- scripts .github` → não existe nenhuma outra implementação em outro script. A main só tem **consumidores** órfãos: `scripts/db-audit/lote-pendente.mjs:49` (`[DRIFT_SCRIPT, '--classificar', ...]`) e `:62`, `scripts/db-audit/check-triple-parity.mjs:181` ("delegada ao check-migration-drift.mjs --classificar").
- Contrato de CI quebrado confirmado nos dois workflows: `.github/workflows/db-live-guard.yml:155-159` (`rc -eq 2 && push` → neutro; com rc=1 abre alerta de drift) e `.github/workflows/types-sync.yml:342-344` (`drift_exit -eq 2` → `awaiting_apply=true`; com 1 fica `false` e os gates de TS rodam contra schema não aplicado) + `:445-450` (Gate 1b depende de `awaiting_apply`).
- PR 1930 (`gh api repos/adm01-debug/Zapp_Web_V2/pulls/1930`): `state=closed`, `merged=false`, `closed_at=2026-11-01T23:48:25Z`, `mergeable_state=behind`. Nunca entrou.

### Não foi remoção deliberada — foi regressão de lote
`git log -S'--classificar' origin/main -- scripts/db-audit/check-migration-drift.mjs` mostra que o flag **existiu na main**:
- `4dadbb74d` (#1942, 15/10) **adicionou** uma versão anterior do flag (`result.applyPending`, `process.argv.includes('--classificar')`);
- `9c0a82cf4` (#1976, 16/10) removeu; `312bd5992` (revert do #1976) devolveu;
- `025d0258d` ("lote 880 cartões + fixes F1-F6 (completo, compila)", 16/10) **removeu de novo e ficou assim**.
Nenhuma mensagem de commit justifica a remoção (não há "remove/revert/desativa" do flag), e os consumidores foram mantidos → colateral do lote, não decisão. Isso explica a triagem antiga "DUPLICATA_PROVAVEL" (o flag já tinha estado na main) e confirma que ela estava errada.

### Por que ninguém detectou
`origin/main:scripts/db-audit/lote-pendente.test.mjs:23-60`: `runWithMock()` escreve um wrapper temporário que **reimplementa** a lógica de `lote-pendente.mjs` em vez de executá-lo; o `runReal()` roda sem `DESTINO_URL`, caminho que nunca chama o drift-script. Teste verde com o contrato quebrado.

### Lacunas adicionais para o port (não estavam no dossiê)
1. **`compare()` da main tem 5 ramos de exceção com `continue`, a branch só conhece 3.** `#2756` (`0601e3b64`, 07/11, posterior ao merge-base `1252bb5a`) adicionou `ledger-archive/registered-tombstone` e `ledger-divergence/pinned-sql-marker` (`origin/main:...check-migration-drift.mjs:38-39`, `continue` em `:726, :750, :772, :789, :824`). A branch tem `continue` só em `:694, :719, :755`. Portar por cherry-pick deixaria os 2 ramos novos escapando com exit 0 sob `--classificar` — exatamente o bug que o comentário W21 da própria branch avisa. O port tem de inserir `classifyIfDiverged()` nos **5** ramos da main atual e os testes de ramo-de-exceção precisam cobrir os 2 novos kinds.
2. **`return 2` ambíguo (defeito da main, não corrigido pela branch).** Na main e na branch, falha de leitura de migrations/evidências e falha de consulta ao ledger também retornam 2 (`:942` e `:965` na main). `lote-pendente.mjs` mapeia `rc===2` → "⏳ apply aguardado" (neutro): uma falha de infraestrutura é reportada como estado esperado. Ao portar, separe (ex.: 3 ou 4 para falha de leitura/consulta) ou o guard fica cego a erro real.
3. `lote-pendente.test.mjs` deve passar a executar `lote-pendente.mjs` de verdade (com `DRIFT_SCRIPT` injetável), senão a regressão volta sem ninguém ver.
