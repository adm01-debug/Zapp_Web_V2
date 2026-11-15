# Dossiê — claude/fix-e2e-workers-timeout-tests-011101-1800 (PR #2504)

- ref: `origin/claude/fix-e2e-workers-timeout-tests-011101-1800` · tip `3153268fe` · merge-base `1252bb5a4` (2026-11-01)
- PR #2504 "fix(e2e): workers CI 1→4 + timeouts explícitos nos 3 testes do mapa/email" — CLOSED 2026-11-02, CI vermelho.
  Comentário de fechamento: "contradiz a #2536 (workers do Playwright fixos em 2, GR-016), que fica como a proposta vigente".
- Triagem 2026-11-08: OBSOLETA. Confirmado aqui com prova.

## Propósito
Job E2E do CI estourava o `timeout-minutes: 20` com `workers: CI ? 1 : 2`. A branch sobe para `workers: CI ? 4 : 2` e,
para compensar a contenção de CPU com 4 workers, adiciona `test.setTimeout(90_000)` e timeouts explícitos de 30 s/10 s nos
3 testes que falharam no PR #2279 (location-picker E71/E72, contact-address E73, email-navy "workspace desmontado" + dialog webkit).
Toda a branch é: 4 arquivos, +18/-10, só `e2e/` + `playwright.config.ts`. Zero `src/`, edges, migrations.

## Arquivo × achado × evidência

| Arquivo | Hunk da branch | Estado na main | Evidência |
|---|---|---|---|
| `playwright.config.ts` | `workers: process.env.CI ? 4 : 2` | **Substituído de propósito**: `workers: 2` fixo ("GR-016: 2 workers em todos os ambientes") | `origin/main:playwright.config.ts:35-36`; commit `a7a53f567` 2026-11-01 "fix(e2e): workers 1→2 em CI — GR-016 (#2560)" (corpo: "instabilidade original resolvida com RETRIES_LOGADOS, a restrição não tem mais fundamento"). O problema-raiz (job de 20 min) foi resolvido de outro jeito: `ci.yml` job `e2e` agora `timeout-minutes: 45` (`origin/main:.github/workflows/ci.yml:443`) e `e2e-logado.yml` fatiado em 5 shards com 45/75 min (`:50-65`). |
| `e2e/location-picker.spec.ts` | `test.setTimeout(90_000)` (E71 e E72) + `toBeVisible({ timeout: 30_000 })` ×2 | Ausente. A main tratou a mesma espera com `await conversa.waitFor({ state: 'visible' })` antes do `expect` (sem limite de 5 s do expect; limitado pelo teto do teste) | `origin/main:e2e/location-picker.spec.ts:94-95`; commit `b46f5d291` 2026-11-04 (#2710). Motivo dos 30 s/90 s na branch era "CI com 4 workers tem maior contenção de CPU" — premissa inexistente na main (2 workers). |
| `e2e/contact-address.spec.ts` | `test.setTimeout(90_000)` no E73 | Ausente (nenhum `test.setTimeout` no arquivo; esperas internas já têm 15 s explícitos em `:214,:224,:235,:245,:258`) | Premissa (4 workers) inexistente; spec roda a cada PR em `ci.yml` via `--project=chromium-mapa` (`ci.yml:502`) e o "CI/CD Pipeline" está verde na main (`dac285f62`, 2026-11-15; `76a6b55ce`; `2cf0153ae`). |
| `e2e/email-navy-visual.spec.ts` | (a) typo em comentário "a lista filtrou"→"a busca filtrou"; (b) `toBeHidden({ timeout: 10_000 })` no dialog de ajuda (webkit); (c) `toHaveCount(1, { timeout: 30_000 })` na remontagem do `.email-workspace` | (a) main mantém "a lista filtrou" — cosmético; (b) `origin/main:e2e/email-navy-visual.spec.ts:300` sem timeout; (c) `:707` sem timeout. A main já tem teto global `test.setTimeout(BOOT_DEADLINE_MS + 30_000)` = 90 s (`:32`) e `abrirEmail` espera o boot antes das asserções. | Os 3 projetos `chromium/firefox/webkit-email-navy` rodam a cada PR (`ci.yml:502`) com `retries: 0` e o CI da main está verde (runs acima) — os testes passam sem os timeouts extras. |

## Veredito: OBSOLETA
- O núcleo da branch (4 workers) foi **rejeitado explicitamente** e substituído por GR-016 (`workers: 2`) em `a7a53f567`; aplicar o hunk contradiria regra vigente na main.
- Os timeouts adicionais existiam só para compensar a contenção de 4 workers (texto dos próprios comentários da branch). Com 2 workers, o CI da main passa nessas specs sem eles (CI/CD Pipeline success em `dac285f62`/`76a6b55ce`/`2cf0153ae`).
- A espera do `[E2E]` em location-picker foi coberta de outra forma na main (`waitFor`, #2710).
- Nenhum `src/`, edge ou migration. Nada a recuperar para o negócio.

## Lacunas residuais (não recuperar)
- `e2e/email-navy-visual.spec.ts:300` `toBeHidden()` do dialog sem timeout explícito no webkit — valor baixo; só faria sentido se o `webkit-email-navy` voltasse a flakar (hoje verde). Hunk se precisar:
  ```ts
  -  await expect(page.getByRole('dialog')).toBeHidden();
  +  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
  ```
- Typo de comentário ("a lista filtrou" → "a busca filtrou") em `:244` — valor nenhum.

## apagar_branch_seguro: true

## Verificação adversarial

Refutação tentada em 2026-11-15. **Triagem CONFIRMADA: OBSOLETA.** Nenhum hunk de valor ≥ médio sobrou.
Diff real conferido por inteiro: `git diff 1252bb5a4 origin/claude/fix-e2e-workers-timeout-tests-011101-1800`
= 4 arquivos, +18/-10, só `e2e/` + `playwright.config.ts` (zero `src/`, edge, migration, workflow).

Prova de cada hunk:

1. **`workers: process.env.CI ? 4 : 2`** — a main tem `workers: 2` com o comentário
   `// GR-016: 2 workers em todos os ambientes (CI e local)` (`origin/main:playwright.config.ts:36-37`).
   Substituição deliberada: `a7a53f5677125710` (2026-11-01, #2560, corpo: "Remove a condicional e fixa
   `workers: 2` em todos os ambientes"). A regra está documentada como vigente em
   `origin/main:docs/agentes/mapa-repo.md:48-49` ("Playwright, 2 workers no CI e local — GR-016").
   Aplicar o hunk violaria regra vigente → não é lacuna, é rejeição.

2. **Problema-raiz (job estourando 20 min) já resolvido por outro caminho** —
   `origin/main:.github/workflows/ci.yml:443` `timeout-minutes: 45`. Medição ao vivo: run
   `43684697344` ("CI/CD Pipeline", push `dac285f62`, 2026-11-15T06:16Z, conclusion **success**),
   job `132722671949` "🎭 E2E Tests (Playwright)", step "🧪 Run Playwright E2E (PR sem autenticação)"
   06:18:22→06:28:30 = **10 min 08 s**, success — com `workers: 2` e SEM nenhum dos timeouts da branch.
   O comando do step (`ci.yml:502`) inclui `--project=chromium-mapa --project=chromium-email-navy
   --project=firefox-email-navy --project=webkit-email-navy`, isto é, os 3 specs tocados pela branch
   rodaram e passaram. A premissa dos timeouts ("CI com 4 workers tem maior contenção de CPU",
   comentário da própria branch em `location-picker.spec.ts`) não existe mais.

3. **`location-picker.spec.ts`: `toBeVisible({ timeout: 30_000 })` ×2** — coberto de outra forma:
   `origin/main:e2e/location-picker.spec.ts:94` e `:200` fazem `await conversa.waitFor({ state: 'visible' })`
   antes do `expect` (commit `b46f5d291`, #2710). O `waitFor` não usa o teto de 5 s do `expect`, logo
   resolve exatamente a falha que o hunk atacava. Substituição verificada abrindo o arquivo da main.

4. **`email-navy-visual.spec.ts`** — a main já tem teto de 90 s para o arquivo inteiro:
   `origin/main:e2e/email-navy-visual.spec.ts:32` `test.setTimeout(BOOT_DEADLINE_MS + 30_000)` com
   `BOOT_DEADLINE_MS = 60000` (`:21`) — cobertura mais ampla que os hunks da branch. Restam sem timeout
   explícito `:300` (`toBeHidden()` do dialog) e `:707` (`toHaveCount(1)` do `.email-workspace`), ambos
   DENTRO desse teto de 90 s e verdes nos 3 engines no run acima. Valor baixo. O typo de comentário
   (`:283` "a lista filtrou") é cosmético.

5. **`contact-address.spec.ts`: `test.setTimeout(90_000)`** — ausente na main, mas as esperas internas já
   têm 15 s explícitos (`origin/main:e2e/contact-address.spec.ts:213,214,224,235,245,258`) e o spec passou
   no run acima via `chromium-mapa`.

Lacuna residual de valor BAIXO (não muda o veredito, fica registrada caso o flake volte): em
`location-picker.spec.ts` a main roda com o teto padrão de 30 s por teste (não há `timeout:` global no
`defineConfig` — arquivo inteiro lido) enquanto o `waitFor({ state: 'visible' })` tem teto próprio de 30 s;
na teoria o orçamento do teste estoura antes do `waitFor` esgotar. Hoje é inofensivo (job de 10 min, verde).
Se voltar a flakar, o hunk é `test.setTimeout(90_000)` no início de E71 e E72.

**apagar_branch_seguro: true** — mantido. Toda a branch é infra de teste, o núcleo contradiz GR-016 e os
2 hunks de valor baixo estão transcritos aqui e na seção "Lacunas residuais" acima.
