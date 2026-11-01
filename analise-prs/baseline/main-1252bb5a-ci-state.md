# Baseline CI — main `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

**Data da medição:** 2026-11-01  
**Fonte:** `github_list_check_runs` via FOREVER MCP  
**SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## Checks obrigatórios — CORREÇÃO: são 3, não 6

**A branch protection vigente exige apenas 3 required checks** (conforme PR #2507 e `scripts/ci/github-settings-baseline.json`):

| Check (required) | Conclusão em `main 1252bb5a` | Obs |
|---|---|---|
| `🔎 TypeCheck` | ✅ `success` | Passou; 0 erros de TypeScript em main |
| `🏗️ Build` | ✅ `success` | Passou; bundle gerado sem erros |
| `✅ CI Gate (required check)` | ✅ `success` | Gate agregado — só passa quando TypeCheck e Build passam |

**IMPORTANTE:** Os checks `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🔒 Security Audit`, `Contrato DB offline` e `🎭 E2E Tests` continuam rodando no ci.yml mas **não são required checks** — não bloqueiam merge. Referência à lista de 6 checks no CLAUDE.md é histórica e está sendo corrigida pela PR #2507.

### Estado dos checks não-obrigatórios em `main 1252bb5a`

| Check | Conclusão | Obs |
|---|---|---|
| `🧪 Unit Tests` | ✅ `success` (3/3) | Todos os shards passaram |
| `🔒 Security Audit` | ✅ `success` | |
| `Contrato DB offline` | ⚠️ `cancelled` | Job cancelado — não é falha de contrato |
| `🎭 E2E Tests (Playwright)` | ❌ **`failure`** | **PRÉ-EXISTENTE no main** — não causado por PRs analisadas |

---

## Implicação para a análise de PRs

- `🎭 E2E Tests` falha em `main 1252bb5a` **antes** de qualquer merge desta sessão.
- PRs marcadas como `BLOQUEADO_CI` por E2E failure podem ser victims do baseline quebrado, não causadores.
- PRs com `MERGE_OK` foram classificadas com base em escopo de diff (sem migration/workflow), não em CI individual de cada PR.
- O auto_merge respeita os required checks — quando os 3 required checks passarem em cada PR, o squash-merge ocorre automaticamente.

---

## Demais checks (não-obrigatórios)

| Check | Conclusão |
|---|---|
| `Vercel Preview Comments` | ✅ success |
| `Vercel Agent Review` | ➖ neutral |
| `update-behind-branches` | ✅ success |
| `🧬 Mutação do mapa` | ➖ skipped |
| `🦕 Edge contracts` | ✅ success |
| `🧩 Node CI Scripts` | ✅ success |
| `🎭 E2E logado (autenticado)` | ⚠️ cancelled |
| `🎭 E2E logado (deslogado-principal)` | ✅ success |
| `🎭 E2E logado (deslogado-secundario)` | ✅ success |
| `Replay local das migrations` | ✅ success |
| `regen` | ✅ success |
| `🔔 Notificar falha` (x3) | ➖ skipped |

---

## Testes E2E conhecidos como falhos no baseline

O check `🎭 E2E Tests (Playwright)` retornou `conclusion=failure`. Para identificar quais specs específicos estavam falhando seria necessário acessar os logs do run `41350571743`. Os specs E2E que historicamente ficam instáveis conforme CLAUDE.md:

- `e2e/catalog.spec.ts` — fixa identificador do projeto oficial, não adaptada para local
- `e2e/fixtures/talkx-demo.ts` — fixture com ID de produção
- `e2e/fixtures/mapa-mocks.ts` — fixture com ID de produção
- `conversation.spec.ts` e `messaging.spec.ts` — reescritos e habilitados em 2026-09-26

**Diagnóstico não verificado** (sem acesso aos logs do job): a falha provavelmente está em um desses specs ou em instabilidade de infra E2E (flake).
