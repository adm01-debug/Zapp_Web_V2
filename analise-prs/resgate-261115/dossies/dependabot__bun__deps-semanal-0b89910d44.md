# Dossiê — dependabot/bun/deps-semanal-0b89910d44 (PR #2894)

**Ref:** `origin/dependabot/bun/deps-semanal-0b89910d44` · tip `9aee73074` · merge-base `e50daef6a` · PR #2894 (CLOSED 2026-11-14T04:45Z, "contida na #3064").

## Propósito
Bump semanal do Dependabot (16 pacotes, commit `92163d08a`) + ajuste humano `3d5fd6726` alinhando o pin do Playwright (workflows, `toolchain.json`, imagem do e2e isolado, fixture de teste, linha E76 do plano) a 1.65.0. Os 19 commits restantes são merges de `main`.

## O que a main já tem (via squash `ab657aa34`, #3064 "pacote 5")
`git diff e50daef6a origin/main -- package.json` mostra 11 dos 16 bumps aplicados: `@elevenlabs/react` 1.21.1, `@tanstack/react-virtual` 3.14.26, `@tiptap/*` 3.33.0, `@vercel/speed-insights` 2.1.0, `mapbox-gl` 3.34.2, `react-i18next` 17.1.13, `globals` 17.14.0, `vite` 8.3.6 (origin/main:package.json:77-79,100,129,140).

## Lacunas (o que a branch tem e a main não) e decisão

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `package.json` | `@supabase/supabase-js` ^2.119.0, `@tanstack/react-query` ^5.106.1, `i18next` ^26.7.2, `pdfjs-dist` ^6.5.438, `@playwright/test` ^1.65.0 | **Excluídos de propósito** no merge `ab657aa34`: "Ficaram fora i18next (estoura o JS inicial), supabase-js, react-query e Playwright 1.65 (o Firefox crasha). `pdfjs-dist` foi mantido em 6.4.299 (`364e9376f`) para não passar do teto de assets." | `git show -s ab657aa34` (tabela PRs incluídas, linha #2894). main hoje: `origin/main:package.json:74,75,88,95,113`. CI do tip da branch: `🏗️ Build` FAILURE, `🎭 E2E Tests (Playwright)` FAILURE, `CI Gate` FAILURE (statusCheckRollup de `9aee73074` via GraphQL) — confirma os dois motivos. |
| `bun.lock` | resoluções dos 5 pacotes acima + `@napi-rs/canvas` 1.1.0 (dep opcional do pdfjs 6.5), `playwright*` 1.65.0 | Idem — derivado do `package.json`. main resolve supabase-js 2.118.0, react-query 5.105.0, i18next 26.5.12, pdfjs 6.4.299, playwright 1.64.1 | `origin/main:bun.lock:339,499,529,531,951,1141,1153,1155` |
| `.github/toolchain.json` | `"playwright": "1.65.0"` | Obsoleto: só faz sentido junto com `@playwright/test` 1.65 (rejeitado). main = 1.64.1 | `origin/main:.github/toolchain.json` |
| `.github/workflows/ci.yml` | `bunx playwright@1.65.0 install ...` | Idem | `origin/main:.github/workflows/ci.yml:484` |
| `.github/workflows/e2e-talkx.yml` | `bunx playwright@1.65.0 install --with-deps chromium` | Idem | `origin/main:.github/workflows/e2e-talkx.yml:94` |
| `scripts/e2e-isolated/images.lock.json` | driver `playwright:v1.65.0-noble@sha256:9beb5460…` | Idem (imagem acompanha a versão do lock; `scripts/ci/playwright-version-lock.unit.mjs` exige paridade com `bun.lock`) | `origin/main` = v1.64.1-noble |
| `scripts/e2e-isolated/network-proof-policy.mjs` | `VERSION='1.65.0'`, `DRIVER=...v1.65.0...` | Idem | main = 1.64.1 |
| `scripts/e2e-isolated/run.mjs` | `if (playwrightVersion !== '1.65.0') throw ...` | Idem | main = 1.64.1 |
| `scripts/ci/e2e-isolated-runtime.unit.mjs` | fixture `version: '1.65.0'` | Idem | main = 1.64.1 |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | linha E76 cita 1.65.0 | Idem (doc derivado) | main cita 1.64.1 |

Nenhum hunk de `src/`, edge ou migration. A branch não tem trabalho único: o Dependabot regenera o grupo `deps-semanal` semanalmente e vai repropor supabase-js/react-query/i18next/pdfjs/Playwright com versões mais novas; o pin 1.65.0 nos 8 arquivos de infra deve ser refeito **junto** com o bump do Playwright que efetivamente passar no E2E (todos os valores — digest da imagem incluído — mudam a cada versão).

## Veredito
**OBSOLETA** (confiança alta). Tudo que falta foi deixado de fora de propósito em `ab657aa34` com motivo registrado (bundle/teto de assets; E2E Firefox), e o CI do tip confirma Build e E2E vermelhos. O comentário de fechamento ("entrou integralmente") é impreciso — 5 dos 16 bumps ficaram fora — mas por decisão documentada, não por perda.

`apagar_branch_seguro` = **true**.

## Para quem quiser retomar (fora desta branch)
Os 5 bumps voltarão pelo Dependabot. Pré-requisitos que o pacote 5 apontou: (1) i18next/pdfjs-dist exigem folga no orçamento de bundle/assets (`scripts/ci` guards de orçamento do #3034); (2) Playwright 1.65 exige investigar o crash do Firefox no job `🎭 E2E Tests (Playwright)` e, ao bumpar, atualizar em conjunto: `.github/toolchain.json`, `ci.yml:484`, `e2e-talkx.yml:94`, `scripts/e2e-isolated/{images.lock.json,network-proof-policy.mjs,run.mjs}`, `scripts/ci/e2e-isolated-runtime.unit.mjs` e as fixtures com `1.64.1` em `scripts/ci/ci-local.unit.mjs:425,438`, `ci-local-integracao.unit.mjs:460`, `check-workflow-pins.unit.mjs:111,172` (essas 4 a branch nem tocou).

## Verificação adversarial

**Parecer: concordo com OBSOLETA.** `apagar_branch_seguro = true`. Tentei refutar por quatro frentes; nenhuma achou hunk de valor ≥ médio fora da main.

1. **Escopo real do diff.** `git diff e50daef6a origin/main...` não — `git diff e50daef6a origin/dependabot/bun/deps-semanal-0b89910d44 --stat`: 10 arquivos, +122/-120, e **todo** hunk fora de `bun.lock`/`package.json` é troca de string de versão (`1.64.1`→`1.65.0`). Conferi hunk por hunk: `.github/toolchain.json:7`, `.github/workflows/ci.yml:479`, `.github/workflows/e2e-talkx.yml:94`, `scripts/ci/e2e-isolated-runtime.unit.mjs:256`, `scripts/e2e-isolated/images.lock.json:14`, `scripts/e2e-isolated/network-proof-policy.mjs:8-9`, `scripts/e2e-isolated/run.mjs:451`, doc E76 linha 108. Zero lógica nova, zero `src/`, edge ou migration. Commits próprios: só `92163d08a` (bump) e `3d5fd6726` (pin); os outros 19 são merges de `main`.

2. **A exclusão foi deliberada, não perda.** `git show -s --format=%B ab657aa34` traz a linha de #2894 na tabela: *"Ficaram fora i18next (estoura o JS inicial), supabase-js, react-query e Playwright 1.65 (o Firefox crasha). `pdfjs-dist` foi mantido em 6.4.299 (`364e9376f`) para não passar do teto de assets."* O motivo também está versionado na própria main: `origin/main:analise-prs/dossies/pr-2894.md:17` ("budget do bundle inicial estourou (326.3 > 325 KB)… o Firefox do Playwright 1.65.0 trava (Page crashed) em `email-navy-visual.spec.ts:363`").

3. **O CI do tip confirma.** `statusCheckRollup` de `9aee73074` (GraphQL): `🏗️ Build` FAILURE, `🎭 E2E Tests (Playwright)` FAILURE, `✅ CI Gate (required check)` FAILURE — os outros 18 checks verdes. Não é branch "boa e esquecida": é branch que não passa.

4. **Os 8 pins de 1.65.0 não são resgatáveis em separado — quebrariam a main.** A main está íntegra em 1.64.1: `origin/main:bun.lock:339,1153,1155` (`@playwright/test`, `playwright`, `playwright-core` = 1.64.1) + `toolchain.json:7`, `ci.yml:484`, `e2e-talkx.yml:94`, `scripts/ci/check-workflow-pins.unit.mjs:21`, `e2e-isolated-images.unit.mjs:22`, `e2e-isolated-routine-ownership.unit.mjs:13`, `playwright-version-lock.unit.mjs:87`. `scripts/ci/playwright-version-lock.unit.mjs` exige paridade lock↔workflows: aplicar o pin 1.65.0 sem o bump rejeitado deixaria a CI **vermelha** por drift. Valor isolado = negativo.

5. **Nada de segurança se perde.** `github_list_dependabot_alerts(state=open)` = `[]`. É grupo de *version update* minor/patch, não security update.

6. **A regeneração é real, não suposição.** `origin/main:.github/dependabot.yml`: ecossistema `bun`, `interval: weekly` (segunda 09:00 America/Sao_Paulo), grupo `deps-semanal` com `patterns: ["*"]` e `update-types: [minor, patch]`, ativo. Histórico confirma a cadência (#2621 em 02/11 MERGED, #2894 em 09/11). Os 5 bumps voltam sozinhos, em versão mais nova.

**Nenhuma lacuna adicional.** Observação sem ação (defeito pré-existente da main, que a branch *não* corrige): o texto E76 em `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:108` afirma que "os três workflows pinam a mesma versão (`ci.yml`, `e2e-logado.yml`, `e2e-talkx.yml`)", mas `e2e-logado.yml` não tem pin de playwright; a branch reescreve a mesma frase trocando só o número, então não há hunk a resgatar.
