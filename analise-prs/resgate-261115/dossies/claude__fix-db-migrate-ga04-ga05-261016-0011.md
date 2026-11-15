# Dossiê — claude/fix-db-migrate-ga04-ga05-261016-0011 (PR #2036)

**Veredito:** PERDIDA_PARCIAL · confiança alta · apagar branch: NÃO (ainda; só após portar as lacunas)

## Propósito
1 commit (`fe4f40c67`, 2026-10-17, pai = merge-base `05826d1e`): "fix(ci): GA04/GA05 — console.error no heredoc db-migrate + fixtures GA05".
- GA04: trocar 2 `console.log` por `console.error` no heredoc inline do `db-migrate.yml` (aviso "Contrato generico" e `descreverConfirmacao`) + 3 testes estáticos anti-regressão.
- GA05: 2 testes de fixture em `verify-ledger-statements.unit.mjs` (ledger com cabeçalho `--`, run 37355980323 / migration 20261004195051); o código de normalização (`flatMap(splitStatements)`) já estava em vigor.

## Atenção: conteúdo stale na branch (NÃO portar)
O arquivo `db-migrate.yml` da branch foi gerado sobre uma main anterior ao merge-base. `git diff origin/main origin/claude/fix-db-migrate-ga04-ga05-261016-0011 -- .github/workflows/db-migrate.yml` mostra, além dos 2 hunks GA04, **regressões**: remove `defaults.run.shell` endurecido, rebaixa `setup-node` v7.1.0→v7.0.0 e `supabase/setup-cli` v3.2.0→v3.0.1, remove o env `REF_DISPARO` (hardening de injeção), remove o guard `CONFIRMATION_HASH`/`validate-runtime-proof.mjs` (W28/E64, main:266-270), remove `--db-url "$SUPABASE_DB_URL"` dos `supabase db push`. Idem em `db-migrate-contratos.unit.mjs`: apaga os 7 testes `W28:` da main (linhas 352-409). Nada disso é intenção da PR — é cópia desatualizada.

O comentário de fechamento ("delta líquido zero contra a main", 2026-10-31) é **falso**: o diff branch×main tem 3 arquivos com conteúdo real (saída acima).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/db-migrate.yml` | **PERDIDA (valor baixo)**: main ainda tem `console.log` no heredoc inline | `origin/main:.github/workflows/db-migrate.yml:865` `console.log('Contrato generico: estrutura de public em '` e `:895` `console.log(modHash.descreverConfirmacao({`. O heredoc (main:271 `RUNTIME_JSON="$RUNTIME" node --input-type=module <<'NODE'`) **não é capturado** por `$(...)`: stdout vai só para o log do job → efeito funcional hoje = zero; é defensivo. O GA04 "P0" do plano (`PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:112`: stderr em `validate-runtime-proof.mjs`/`run-runtime-contract.mjs`) **já está na main**: `validate-runtime-proof.mjs:611` e `:643` `process.stderr.write`, `:649` `process.stdout.write(confirmacao)`; `git grep console.log origin/main -- scripts/db-audit/validate-runtime-proof.mjs scripts/db-audit/run-runtime-contract.mjs` = vazio; o hash é capturado e comparado em main:266-270. Resto do diff do arquivo = stale (ver seção acima). |
| `scripts/ci/db-migrate-contratos.unit.mjs` | **PERDIDA (valor baixo/médio)**: 3 testes `GA04:` ausentes na main | `git grep -n 'GA04' origin/main -- scripts/ci` = vazio. O 1º teste (`doesNotMatch(y, /console\.log.*Contrato generico/)`) **falharia na main hoje** (linhas 865/895) — só pode entrar junto com o hunk do yml. Os outros 2 passam na main (sem `console.log` nos scripts; `:643` casa `/process\.stderr\.write.*descreverConfirmacao/`) e são parcialmente cobertos pelos testes `W28:` da main (stdout vazio/stderr, linhas 352-409). Remoção dos W28 na branch = stale, ignorar. |
| `scripts/ci/verify-ledger-statements.unit.mjs` | **PERDIDA (valor médio)**: 2 testes `GA05:` ausentes; o código já está na main e **passa** no fixture | Código: `origin/main:scripts/db-audit/verify-ledger-statements.mjs:49-50` `doLedger.flatMap(splitStatements)` / `statementsDoArquivo.flatMap(splitStatements)`. Testes: `git grep -n -E 'GA05|cabecalho' origin/main -- scripts/ci/verify-ledger-statements.unit.mjs` = vazio. Prova rodada no scratch com os módulos de `origin/main` (`scratchpad/ga05-check/run.mjs`): `igual : {"ok":true,"total":1}` · `difere : {"ok":false,"motivo":"o statement 1 do ledger difere do arquivo"}` → os 2 testes passariam. |

## Lacunas a recuperar (branch nova de `main`; diff mínimo)

### 1. `.github/workflows/db-migrate.yml` — 2 linhas (main:865 e main:895)
```diff
-            console.log('Contrato generico: estrutura de public em '
+            console.error('Contrato generico: estrutura de public em '
               + String(proof.structure_sha256).slice(0, 12)
               + '; a autorizacao do apply depende da confirmacao do runtime_sha256 do dry-run.');
...
-          console.log(modHash.descreverConfirmacao({
+          console.error(modHash.descreverConfirmacao({
             runtimeSha256: proof.runtime_sha256,
```
Workflow → PR fica aberta para o dono (regra AGENTS.md: CI/workflows).

### 2. `scripts/ci/db-migrate-contratos.unit.mjs` — inserir após o teste `E62: todo o inventario de supabase/migrations resolve` (main:293-314), antes de `E62: o parser recusa SQL sem ON_ERROR_STOP` (main:316)
```js
// ---------------------------------------------------------------------------
// GA04: console.log no heredoc inline do db-migrate.yml contamina stdout
// quando o passo e' capturado por automacao. validate-runtime-proof.mjs
// (script standalone) e run-runtime-contract.mjs ja usam process.stderr.write
// e console.error; o heredoc inline precisava das mesmas correcoes.
// ---------------------------------------------------------------------------

test('GA04: db-migrate.yml nao usa console.log para diagnosticos no heredoc inline', () => {
  const y = ler('.github/workflows/db-migrate.yml');
  assert.doesNotMatch(y, /console\.log.*Contrato generico/,
    'aviso do contrato generico tem de ir ao stderr (console.error)');
  assert.doesNotMatch(y, /console\.log.*descreverConfirmacao/,
    'descricao da confirmacao tem de ir ao stderr (console.error)');
});

test('GA04: validate-runtime-proof.mjs so usa process.stdout.write para o hash', () => {
  const src = ler('scripts/db-audit/validate-runtime-proof.mjs');
  assert.doesNotMatch(src, /console\.log/,
    'validate-runtime-proof nao pode ter console.log: stdout tem de ser so o hash');
  assert.match(src, /process\.stdout\.write\(confirmacao/,
    'o hash de confirmacao vai via process.stdout.write');
  assert.match(src, /process\.stderr\.write.*descreverConfirmacao/,
    'a descricao da confirmacao vai ao stderr');
});

test('GA04: run-runtime-contract.mjs nao tem console.log (stdout e so JSON do proof)', () => {
  const src = ler('scripts/db-audit/run-runtime-contract.mjs');
  assert.doesNotMatch(src, /console\.log/,
    'nenhum console.log no executor: stdout tem de ser exclusivamente o JSON do proof');
});
```
`ler` já existe na main (`const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');`, linha ~16). O 1º teste depende do item 1.

### 3. `scripts/ci/verify-ledger-statements.unit.mjs` — inserir após `R2-INF-005: o heredoc do ledger e SQL valido` (main:102-109)
```js
// ---------------------------------------------------------------------------
// GA05: o psql pode gravar um cabecalho "--" no inicio de um statement
// armazenado (run 37355980323, migration 20261004195051). O flatMap sobre
// splitStatements ja normaliza os dois lados -- estes testes provam isso
// e garantem que arquivo diferente continua reprovando.
// ---------------------------------------------------------------------------

test('GA05: statement do ledger com cabecalho -- normalizado pelo splitStatements', () => {
  const bruto = JSON.stringify(['-- cabecalho de psql\nCREATE TABLE public.ga05_fixture (id int)']);
  const statementsDoArquivo = ['CREATE TABLE public.ga05_fixture (id int)'];
  const r = avaliarStatementsDoLedger({ bruto, statementsDoArquivo });
  assert.equal(r.ok, true, 'cabecalho -- no ledger tem de ser normalizado e passar');
  assert.equal(r.total, 1);
});

test('GA05: arquivo diferente do ledger continua reprovando mesmo com normalizacao', () => {
  const bruto = JSON.stringify(['-- cabecalho de psql\nCREATE TABLE public.ga05_fixture (id int)']);
  const statementsDoArquivo = ['CREATE TABLE public.ga05_DIFERENTE (id int)'];
  const r = avaliarStatementsDoLedger({ bruto, statementsDoArquivo });
  assert.equal(r.ok, false, 'conteudo diferente tem de reprovar mesmo com normalizacao');
  assert.match(r.motivo, /statement 1/);
});
```
`avaliarStatementsDoLedger` já é importado na main (linha 21). Independente dos itens 1-2 (pode ir em PR só de teste, mergeável sem o dono).

Verificação após portar: `node --test scripts/ci/db-migrate-contratos.unit.mjs scripts/ci/verify-ledger-statements.unit.mjs`.

## Verificação adversarial

**Parecer: CONCORDO — PERDIDA_PARCIAL confirmada; não apagar a branch ainda.** Tentei refutar a triagem por três vias (lacuna já na main / removida de propósito / não encaixa mais) e nenhuma se sustentou. `origin/main` = `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5` (15/11/2026).

| Checagem adversarial | Resultado | Evidência |
|---|---|---|
| A lacuna do yml já está na main? | **Não** | `git show origin/main:.github/workflows/db-migrate.yml` → `:865 console.log('Contrato generico: estrutura de public em '` e `:895 console.log(modHash.descreverConfirmacao({`. Nenhum outro `console.error` cobre essas duas saídas. |
| Os testes GA04/GA05 já estão na main? | **Não** | `git grep -n -E 'GA04\|GA05\|cabecalho de psql' origin/main -- scripts/ci` = vazio; `git grep -n 'ga05_fixture' origin/main` = vazio. |
| Foi removido de propósito (revert/remove)? | **Não** | `git log -S"Contrato generico" --oneline origin/main -- .github/workflows/db-migrate.yml` → 025d0258d, 312bd5992, 9c0a82cf4, 4dadbb74d, 216304e98; nenhum toca a escolha stdout→stderr dessas duas linhas (o único `revert:` é #1982, do lote 1976, não deste escopo). Histórico de `scripts/ci/verify-ledger-statements.unit.mjs` (9246b0108, b44540e35, 4dadbb74d…) nunca teve testes GA05 para reverter. |
| O trabalho ainda encaixa na main? | **Sim** | `avaliarStatementsDoLedger` já importado em `origin/main:scripts/ci/verify-ledger-statements.unit.mjs:21`; helper `ler` existe em `origin/main:scripts/ci/db-migrate-contratos.unit.mjs:18`; âncoras de inserção citadas no dossiê existem (`R2-INF-005 … heredoc do ledger e SQL valido` em :102-109). |
| Os 2 testes GA05 realmente passam na main? | **Sim (rodado)** | Working tree idêntico à main nesses arquivos (`git diff --stat origin/main -- …` vazio). `node` com `scripts/db-audit/verify-ledger-statements.mjs` da main: `igual : {"ok":true,"total":1}` · `difere : {"ok":false,"motivo":"o statement 1 do ledger difere do arquivo"}` → ambas as assertivas do dossiê batem. |
| O valor do hunk do yml é mesmo baixo? | **Sim, confirmado** | O heredoc que contém :865/:895 começa em `origin/main:.github/workflows/db-migrate.yml:271` (`RUNTIME_JSON="$RUNTIME" node --input-type=module <<'NODE'`) e **não** é capturado por `$(...)` — só o validador externo é (`:266 CONFIRMATION_HASH="$(… validate-runtime-proof.mjs)"`), e esse já escreve diagnóstico em stderr na main (`validate-runtime-proof.mjs:611`, `:643`) com apenas o hash em stdout (`:649`). Logo o GA04 "que importa" está incorporado; sobra endurecimento defensivo. |
| Há lacuna ADICIONAL que a triagem deixou passar? | **Não** | As demais linhas de `missing_sample` são variantes **mais fracas** já superadas na main: guard de ref existe com hardening (`main:82-86`, usa `${REF_DISPARO}` em vez de interpolação direta), `TARGET_NAME` existe com quoting (`main:232-233`), e os `supabase db push` da main têm `--db-url "$SUPABASE_DB_URL"` (branch remove). `setup-node@…#v7.0.0` da branch é **rebaixe** do v7.1.0 da main. Confirma o diagnóstico de "branch stale": nada a portar além dos 3 itens. |

Discordância residual: nenhuma. Mantenho a ordem de prioridade do dossiê — item 3 (GA05, valor médio, PR só de teste, mergeável sem o dono) primeiro; itens 1+2 juntos em PR de workflow que **fica aberta para o dono** (AGENTS.md: CI/workflows). Branch só pode ser apagada depois do merge dessas duas PRs.
