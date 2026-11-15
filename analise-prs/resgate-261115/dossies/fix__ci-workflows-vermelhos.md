# fix/ci-workflows-vermelhos — OBSOLETA

- Ref: `origin/fix/ci-workflows-vermelhos` · tip `0770f6b5e` (1 commit, 2026-10-21) · merge_base `d7af7a67` (2026-10-19)
- PRs com o mesmo tip: #2151, #2445 (triagem 2026-11-08: OBSOLETA nos dois)
- Diff: 325 arquivos, +1023/-609. Commit único: `fix(ci): destravar os workflows que falhavam antes de executar`

## Propósito real da branch

Não é uma feature. É um **reparo emergencial de uma `main` que não compilava** em 19–21/10: declarações
duplicadas (`const tokens` em `gmail-helpers.ts`, `export function tituloDe` duas vezes em
`marcador-specs.mjs`, `concurrency:` duplicado em `talkx-status-regen.yml`), referências a símbolos
inexistentes (`presences`, `LoginAdminClient`, `EMAIL_LIMIT_WINDOW_MS`, `selectGmailAccountsDue`) e
baselines de doc/teste fora de sincronia. O agente destravou o CI em parte **apagando código**: ~40 ações
do `evolution-api`, dezenas de entradas de `CONTROL_ACTIONS/SEND_ACTIONS/READ_ACTIONS` e o passo
`live-invariants` do `consolidar-veredito.mjs`.

A `main` resolveu a mesma quebra por outro caminho (ver `bd4c4bd7a`, `312bd5992` "revert: desfaz o lote
#1976 (main não compilava) (#1982)") **mantendo as funcionalidades**. Portar esta branch hoje seria
destrutivo.

## Arquivo × achado × evidência

| Grupo (nº arq.) | Achado | Evidência na `main` |
|---|---|---|
| 272 testes `src/**` | stub `createLogger` no `vi.mock('@/lib/logger')` | já na main, versão mais rica (`createLogger: vi.fn(() => ({...withCorrelation}))`) — ex. `src/lib/__tests__/pdfThumbnail.test.ts:40`, `src/hooks/system/__tests__/useGeoBlocking.test.ts:60`, `src/services/__tests__/auth.service.signIn.test.ts:12`. Verificado em 272/272. |
| 3 testes de compras | `ContactPurchasesPanel.*`, `useContactPurchases.criar` | arquivos **removidos** da main em `bd4c4bd7a chore(crm): remove módulo de pagamentos/compras do front (decisão 2026-11-03)` |
| `supabase/functions/evolution-api/index.ts` (-90) | branch apaga `set-presence`, `set-settings`, `get-settings`, `get-webhook`, `send-template`, `mark-unread`, `find-chats`, `find-messages`, `find-status-messages` | main tem **todas**, com guarda de flavor GO: linhas 1136, 1147/1149, 1195, 1318, 1331, 1338, 1349, 1481 |
| `_shared/evolution-control-authz.ts` (-27) | branch apaga entradas da matriz de autorização | main mantém a matriz completa (377 linhas): `set-presence:66`, `get-settings/set-settings/get-webhook:92`, `find-chats:95`, `offer-call:136`, `mark-unread:140`, `invite-info:182` |
| `_shared/gmail-helpers.ts` | remove `fetch` duplicado antes do `requestGmailTokenRefresh`; adiciona `GMAIL_REAUTH_HTTP_STATUS`/`gmailReauthErrorPayload` | main já extraiu `requestGmailTokenRefresh` e exporta os dois símbolos (`gmail-helpers.ts:138,140`), consumidos por `gmail-oauth/index.ts:255` e `gmail-send/index.ts:79` |
| `_shared/evolution-webhook-handlers.ts` | declara `presences`/`isComposing` que faltavam | main compila (declarações presentes) |
| `auth-login/index.ts` | cria `LoginAdminClient`, troca `EMAIL_LIMIT_WINDOW_MS` | main: `LoginAdminClient` em `:88`, `EMAIL_LIMIT_WINDOW_SECONDS` em `:117` |
| `connection-health-check/index.ts` | `dedupeAlerts`, `kind`, `title/message` | main tem tudo e mais (`:578 dedupeAlerts`, `:223 REASON_LABEL`, nível 1/2) |
| `gmail-cron-sync/index.ts` | tipa `GmailCronAccount` e redeclara `selectGmailAccountsDue` local | main usa a função compartilhada de `_shared/gmail-helpers.ts` com `now` injetável (`_shared/__tests__/gmail-reauth-required.test.ts:89`) |
| `webauthn/index.ts` | `limiter(` → `enforceRateLimit(` | main: `const rateLimit = deps.enforceRateLimit ?? enforceRateLimit` (`:193`) |
| `_shared/validation.ts` | re-export de `isAllowedOrigin`/`FALLBACK_ORIGIN` | desnecessário: todos importam de `_shared/cors-origins.ts` (ex. `approve-password-reset/index.ts:12`) |
| `.github/workflows/ci.yml` | playwright 1.63→1.64.1; lista de projetos E2E sem `firefox-auth/webkit-auth`; cache Bun por job; Deno check/test | tudo na main: `ci.yml:484` (1.64.1), `:502` (mesma lista de projetos), caches Bun em `:58,98,140,242,312`, job dedicado `edge-contracts` em `:203-223` |
| `ci.yml` — upload de coverage | branch adiciona `Upload coverage report` | **rejeitado de propósito** na main: `ci.yml:289-291` "Não tente anexar `coverage/` neste runner: ele é separado dos shards e o upload anterior era no-op" |
| `ci.yml` — `node --test` extra (`edge-deploy/*`, `crm-sync-outbox-contract`, `types-sync-psql-buffer`, `talkx/*`) | redundante | `deploy-functions.yml:228` roda `edge-deploy/*.unit.mjs`; `db-guard.yml:222-226` roda todo `scripts/db-audit/*.test.mjs`; talkx listados em `ci.yml:166+` |
| `db-migrate.yml` | chama `validate-runtime-proof.mjs` | main: `db-migrate.yml:266` |
| `deploy-functions.yml` | `deno check --config supabase/functions/deno.json` | main: `deploy-functions.yml:494` (mesma correção, comentário GR-001) |
| `e2e-logado.yml` | bump playwright + cache key | **alvo inexistente**: main reescreveu o workflow para `scripts/e2e-isolated/run.sh` com backend descartável; não há passo `bunx playwright install` |
| `notifica-falha-main.yml` | linhas `falha:`/`avisa:` no bloco `# docs:` | main já tem as duas (linhas 4-5), com texto melhor |
| `talkx-status-regen.yml` | remove `concurrency:` duplicado | main tem **uma** chave (`:38-40`) |
| `vercel-env-cleanup.yml` | bloco `# docs:`, `permissions`, `defaults`, `persist-credentials`, Node 24 | tudo na main (`:1-5,17,20,43,47`), mais a nota de 14/11 sobre a restauração do workflow |
| `scripts/ci/marcador-specs.mjs` | remove `tituloDe` duplicado | main tem uma só (`:87`) |
| `scripts/ci/check-test-inventory.mjs` | adiciona `ignore-build.unit.mjs` na `ALLOWLIST_NODE` | main **esvaziou** a allowlist de propósito (`:70` + comentário "novas suítes Node sem bloco `run:` devem falhar no inventário em vez de entrar nesta lista") e roda o script em `ci.yml:190` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | 16→15 workflows; pino literal de playwright | main: 21 workflows (`:298,305`) e versão **lida do bun.lock** (W39, `:359,481`) |
| `scripts/ci/security-workflow.unit.mjs` | regex `${{ secrets.X }}` | main: `:36` idêntico |
| `scripts/ci/workflow-contracts.unit.mjs` | fecha o `});` faltante | main: `:565` |
| `scripts/ci/edge-coverage-authz.unit.mjs` | +2 testes fora da medição; `skip` sem Deno | os 2 testes estão na main (`:72,73`); o `skip` não — main instala Deno 2.9.5 no job (`ci.yml:128-133`), que é melhor que pular em silêncio |
| `scripts/ci/check-talkx-docs.unit.mjs` | `ESTADOS.md` | main: `:55` |
| `scripts/db-audit/n011-storage-policies-dedup.test.mjs` | reescreve o contrato (par já removido por migration anterior) | main chegou à mesma conclusão e foi além (replay limpo + drifted), `:29 NOMES_REMOVIDOS_N011` |
| `scripts/db-audit/talkx-analytics-contract.test.mjs` | asserts `label="Mais usados"` / `title="Mais convertidos"` | main: `:97,100` |
| `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` | import `./talkx-window.ts` | main: `:89` |
| `scripts/db-audit/consolidar-veredito.mjs` | **apaga** o passo `live-invariants` | main mantém (2 ocorrências) — remoção é regressão |
| `scripts/db-audit/check-migration-drift.test.mjs` | chave `'sql-sha256'` no fixture | main usa outro formato de manifesto (`-- sql-sha256:` como statement, `:65,308,325`) |
| `src/__tests__/a11y/icon-buttons-baseline.json` | remove 5 entradas | main já não tem nenhuma das 5 (grep = 0) |
| `src/hooks/integrations/__tests__/useCustomEmojis.upload.test.tsx` | mock com `.order().order().range()` | main: `:80-81` |
| Docs (`CLAUDE.md`, `ESTADO.md`, `FEATURE_REGISTRY.md`, `DB-INVENTORY.md`, `docs/ci/README.md`, `docs/talkx/*`, `docs/audits/*`) | snapshots de 21/10 | superados: `docs/ci/README.md` é **gerado** e diz "21 workflows" (`:7`); `FEATURE_REGISTRY.md:8` = 56 views com `supervisao`/`search-insights`/`talkx-kit`; `ESTADO.md:7` = 92 edges. Pior: `docs/audits/edge-functions-authz-coverage.md` da branch baixa a cobertura (245/346 → 239/342) **porque a branch apagou código do authz** — número errado para a main. |

## Veredito

**OBSOLETA.** O que ainda falta na main são 3 itens de uma linha, de valor baixo, que não dependem desta
branch (abaixo). Todo o resto está incorporado (prova por arquivo) ou foi **rejeitado de propósito** pela
main (upload de coverage, allowlist do inventário, live-invariants, matriz do authz). `apagar_branch_seguro = true`.

## Resíduos recuperáveis (não precisam da branch — 3 linhas)

1. `bunx playwright install-deps` **sem versão** em dois pontos da main, enquanto o comentário logo acima
   explica por que pinar (SonarCloud `githubactions:S8543`):
   - `.github/workflows/ci.yml:490` → `run: bunx playwright@1.64.1 install-deps chromium firefox webkit`
   - `.github/workflows/e2e-talkx.yml:98` → `run: bunx playwright@1.64.1 install-deps chromium`
2. `scripts/ci/github-settings-guard.unit.mjs:416-420` mantém a lista de environments **hardcoded**; a
   branch lia do baseline versionado:
   ```js
   const baseline = JSON.parse(readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'));
   const todos = [...baseline.environments, ...extras];
   ```
3. `scripts/db-audit/consolidar-veredito.test.mjs:168` deixa o `::error::` do CLI vazar para o log do passo
   (anota "Fixtures de E2E em producao (E85)" mesmo com o teste passando). Fix da branch:
   `execFileSync(process.execPath, [script], { cwd: RAIZ, env, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })`.

Descartados de propósito (NÃO portar): remoções em `evolution-api`/`evolution-control-authz`, remoção do
`live-invariants`, `codigoDeProcesso`/exit-0 do `scripts/mutation/run-mapa.mjs` (job `mutation-mapa` é
`continue-on-error: true`, não bloqueia merge — `ci.yml:544`), upload de coverage, `ALLOWLIST_NODE`,
e todos os snapshots de doc.

## Verificação adversarial

Tentei refutar OBSOLETA abrindo os hunks de maior volume do `git diff d7af7a67 origin/fix/ci-workflows-vermelhos`
e conferindo cada substituição alegada na `main` (`dac285f62`). **Não achei nenhum hunk de valor ≥ médio fora da main.**
Confirmo o veredito e o `apagar_branch_seguro = true`.

### Checagens que sustentam OBSOLETA

- **Branch é destrutiva, não aditiva.** `git diff … -- supabase/functions/evolution-api/index.ts` só tem
  linhas `-`: apaga `set-presence`, `set-settings`, `get-settings`, `get-webhook` (inclusive o bloco GO que
  lê `/instance/fetchInstances`), `send-template`, `mark-unread`, `find-chats`, `find-messages`,
  `find-status-messages` e o import `goHistoryNotSupported`. A main tem todas:
  `origin/main:supabase/functions/evolution-api/index.ts:1136,1147,1149,1195,1318,1331,1338,1348,1481`.
- **Matriz de authz:** `origin/main:supabase/functions/_shared/evolution-control-authz.ts` = **377 linhas**;
  a mesma na branch = **282**. Entradas vivas na main: `:66 set-presence`, `:92 get-settings/set-settings/get-webhook`,
  `:95 find-chats`, `:136 offer-call`, `:140 mark-unread`, `:182 invite-info`.
- **`live-invariants`:** presente na main (`scripts/db-audit/consolidar-veredito.mjs:42` e `:63`); a branch remove. Regressão.
- **CI já tem o que a branch propôs:** `ci.yml:221` `deno check --config scripts/ci/deno.json --frozen …`,
  `:223` `deno test --config … --frozen`, job dedicado `edge-contracts` (`:202`), `setup-deno 2.9.5` no job
  `node-scripts` (`:130-133`), `bunx playwright@1.64.1 install --with-deps` (`:484`).
- **Upload de coverage:** rejeitado de propósito na main — comentário em `ci.yml:289-291`.
- **Pino de playwright:** `scripts/ci/ci-docs-baseline.unit.mjs:359-371` lê a versão do `bun.lock` (W39),
  o que é superior ao literal `1.64.1` da branch.
- **`run-mapa.mjs` (61 linhas fora da main):** sem valor. O job `mutation-mapa` é `continue-on-error: true`
  (`ci.yml:542`) e só roda com `map_changed == 'true'` (`:609`), em `ubuntu-24.04` (Node pré-instalado) —
  o ENOENT do shim que a branch contorna não se materializa, e o `exit 0` em medição inválida esconderia infra quebrada.
- **`e2e/auth.spec.ts`:** a main reescreveu o teste com `getByRole('button', { name: 'Entrar', exact: true })`
  (`:11`) — mesma intenção do `/^entrar$/i` da branch, em teste melhor (valida a constraint nativa do `type=email`, `:15-21`).
- **272 stubs `createLogger`:** 299 arquivos de teste em `src/**/__tests__/` da main já têm `createLogger`; spot-check
  em `IncomingCallAlert.canal`, `BusinessHoursIndicator`, `LGPDComplianceView` = presente nos três.
- **3 arquivos ausentes da main** (`ContactPurchasesPanel.erro-gravacao`, `ContactPurchasesPanel.total-erro-data`,
  `useContactPurchases.criar`) foram removidos de propósito: `bd4c4bd7a chore(crm): remove módulo de
  pagamentos/compras do front (decisão 2026-11-03) (#2690)`.
- **Docs da branch são snapshots velhos:** `docs/ci/README.md:7` da main diz **21 workflows** (arquivo gerado por
  `scripts/ci/render-workflow-docs.mjs`, com `--check` no CI); `ESTADO.md:7` = **92 edges** (branch: 15 e 84).
- Nenhum arquivo novo (`--diff-filter=A` vazio) e nenhuma deleção de arquivo na branch.

### Correção ao dossiê: 1 dos 3 "resíduos" NÃO deve ser portado

O item `scripts/db-audit/check-migration-drift.test.mjs` → chave `'sql-sha256'` no `pinnedEvidence` **quebraria a main**,
não é lacuna recuperável:
- `check-migration-drift.mjs:198-203` define as chaves EXATAS do `kind` `ledger-divergence/pinned-replay`
  (`file_sha256, file_sql_sha256, filename, justification, kind, ledger_name, ledger_sql_sha256,
  ledger_statements_sha256, reason, related_migration, version`) e `:210` reprova via `hasExactKeys`
  com "possui campos ausentes ou desconhecidos".
- O manifesto real `scripts/db-audit/migration-evidence.json` tem **113 exceções e 0 ocorrências de `"sql-sha256"`**;
  o conjunto de chaves usadas não inclui essa. Na main `sql-sha256` é prefixo de *marker* dentro do SQL
  (`check-migration-drift.mjs:99`), não campo do manifesto. A premissa do comentário da branch ("o manifesto real
  exige esta chave", "51 registros") era verdadeira só no estado de 19/10.

Resíduos **realmente** abertos (os 2 primeiros do dossiê, mais 1 que confirmei): valor baixo, independentes da branch.
- `.github/workflows/ci.yml:490` → `bunx playwright install-deps chromium firefox webkit` sem versão, logo abaixo do
  comentário `:481` que justifica pinar (SonarCloud `githubactions:S8543`).
- `.github/workflows/e2e-talkx.yml:98` → `bunx playwright install-deps chromium` sem versão (`:94` já usa `playwright@1.64.1`).
- `scripts/ci/github-settings-guard.unit.mjs:415-419` → lista de environments hardcoded no stub
  (`'banco-leitura', 'copilot', …, 'Production'`) em vez de ler `github-settings-baseline.json`.
- `scripts/db-audit/consolidar-veredito.test.mjs:168` → `execFileSync(process.execPath, [script], { cwd, env, encoding })`
  sem `stdio: ['pipe','pipe','pipe']`; o `::error::` do CLI vaza para o log do passo.
