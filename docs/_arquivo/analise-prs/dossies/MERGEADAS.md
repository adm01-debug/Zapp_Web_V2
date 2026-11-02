# Dossiers das 11 PRs Mergeadas

Todas mergeadas via `auto_merge=squash` com CI Gate passando no momento do merge.

## PR #2283 — fix: timeout E2E 20→45 min
- **SHA:** `6271b716e08df80d21b6cfdbdfd9263ddb6e7acb` | **Data:** 2026-10-27T20:04:29Z
- **Válida:** SIM — timeout E2E era insuficiente (20 min) para suíte completa
- **Regressão:** NÃO — altera só configuração de timeout do CI
- **Já em main antes:** NÃO
- **Regra de negócio:** correta — fix de CI puro

## PR #2447 — docs(ci): RELATORIO_CI.md e PENDENCIAS.md
- **SHA:** `3617a2acd517dcc9a6eaf2533cd256913e462c21` | **Data:** 2026-11-01
- **Válida:** SIM — documentação de CI e pendências
- **Regressão:** NÃO — só docs
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2482 — docs(talkx): V4 vigente, V3 substituído
- **SHA:** `3b5f8a96db0337af7310eec1b0dc5f86bb45912c` | **Data:** 2026-11-01
- **Válida:** SIM — corrige docs para refletir plano V4 vigente
- **Regressão:** NÃO — só docs
- **Já em main antes:** NÃO
- **Regra de negócio:** correta (CLAUDE.md: "V4 vigente")

## PR #2547 — infra: E2E logado timeout 45 min
- **SHA:** `3066fac062f934e5469bb573e88bc464559a023c` | **Data:** 2026-11-02T02:13Z
- **Válida:** SIM — timeout `e2e-logado.yml` insuficiente
- **Regressão:** NÃO — CI config
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2560 — fix(e2e): workers 1→2 em CI — GR-016
- **SHA:** `a7a53f56771257106ad79847e6a9f13b9ddada80` | **Data:** 2026-11-02T02:43Z
- **Válida:** SIM — fluxo GR-016 falhava por concorrência com 1 worker
- **Regressão:** NÃO — CI config
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2545 — chore: freeze features + 9 fluxos críticos
- **SHA:** `c16f3c69a9bffea1899760288d6c5d576acc2495` | **Data:** 2026-11-02T03:01Z
- **Válida:** SIM
- **Regressão:** NÃO — policy doc
- **Já em main antes:** NÃO
- **Regra de negócio:** correta (decisão do Joaquim)

## PR #2567 — fix(ci): deno install --frozen=false
- **SHA:** `8ba0b4361290f37171fd6ec27012a46665ca5b7e` | **Data:** 2026-11-02T03:51Z
- **Válida:** SIM — deploy de edge functions falhava por lockfile desatualizado
- **Regressão:** NÃO — CI fix
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2543 — fix: E2E alto-contraste + N-008 healthcheck
- **SHA:** `3e6ed32ac34d9bcb9734ccfb05e580500bf5623d` | **Data:** 2026-11-02T04:16Z
- **Válida:** SIM
- **Regressão:** NÃO
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2569 — fix(ci): testes GR-027 + gatilho e2e-logado GR-029
- **SHA:** `50ca61a6ef96b366084548fbb3866974083def52` | **Data:** 2026-11-02T04:43Z
- **Válida:** SIM
- **Regressão:** NÃO
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2522 — fix(e2e): aguarda teclado visível antes do clique — Firefox GR-012
- **SHA:** `4b5c6e7970512d16db5501a35cb2e7176941f69d` | **Data:** 2026-11-02T05:20Z
- **Válida:** SIM
- **Regressão:** NÃO
- **Já em main antes:** NÃO
- **Regra de negócio:** correta

## PR #2549 — fix: reconexão automática WhatsApp via health check
- **SHA:** `dfef2487a2c3b86101f23ef50d2c1d862b4fe03a` | **Data:** 2026-11-02T05:32Z
- **Válida:** SIM
- **Regressão:** NÃO
- **Já em main antes:** NÃO
- **Regra de negócio:** correta (CLAUDE.md §2 runbook)
