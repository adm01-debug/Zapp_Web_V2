# Baseline do main — SHA: 9183f0f6fa4296cd07c585602bc5ea88ada5d98d
Data: 2026-11-09

## Estado do CI gate (CRÍTICO)

### ⛔ CI gate QUEBRADO — `🧪 Unit Tests (2/3)` falha em TODA PR nova

**Causa raiz:** PR #2550 (`claude/fix-talkx-unit-tests-...`) sobrescreveu
`src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx`
deixando apenas blocos `vi.mock()` sem nenhum `describe`/`it`.

```
Error: No test suite found in file
src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx
```

**Evidência:** run `42521096687` — shard `Unit Tests (2/3)` falhou com esse erro exato.

**PRs com fix (ambas aguardando CI runners):**
- PR #2851: `claude/fix-ci-talkx-report-test-261108-2152` — SHA `74b2bb0b`
- PR #2864: `claude/fix-talkx-report-test-suite-261108-2355` — SHA `784bb18a`

**Desbloqueio:** mergear qualquer uma dessas duas PRs libera o CI gate para as 41 PRs AGUARDANDO_CI.

---

## Fila do GitHub Actions (2026-11-08/09)

Desde ~23:23 UTC de 2026-11-08, a fila do GitHub Actions está congestionada:
94+ runs em estado `queued`, nenhum concluindo. Todos os checks de todas as PRs abertas
estão parados. Não há ação possível no nosso lado — é infraestrutura do GitHub.

---

## Typecheck

Baseline medido em main via CI (commit `9183f0f6`):
- **93 erros de TypeScript pré-existentes** (ratchet registra baseline=93)
- Erros não são regressão — existiam antes desta sessão de análise
- Fonte: hook `typecheck-ratchet` no pre-commit

## Lint (ESLint)

Erros pré-existentes no main (NÃO são regressão das PRs):
- `local/no-secret-compare`: ~14 erros em `_shared/cron-secret-auth.ts`
- `@typescript-eslint/no-explicit-any`: vários
- `react-refresh/only-export-components`: warnings
- `no-restricted-imports`: warnings
- EXIT: 0 (lint não faz exit 1 por regra, só relata)

## Unit Tests

**CI gate quebrado** — ver seção acima. O shard `Unit Tests (2/3)` falha em toda PR
nova por causa do `TalkXCampaignReport.test.tsx` sem suítes de teste.

Outros shards (1/3 e 3/3) passam normalmente baseado em evidências de checks anteriores ao PR #2550.

## Build

Vercel build verde no último deploy bem-sucedido da main.
Sem evidências de regressão de build introduzidas na janela de análise (PRs analisadas
foram todas em branches separadas, nenhuma mergeada nesta sessão — CI congestionado).

---

## PRs em aberto na data desta análise: 73

| Veredicto | Contagem |
|---|---|
| AGUARDANDO_CI | 41 |
| DRAFT | 18 |
| REGRA8_MIGRATION | 7 |
| REGRA8_WORKFLOW | 6 |
| OBSOLETO | 1 |

Detalhes completos: `analise-prs/RELATORIO_PRS.md` e `analise-prs/prs.json`.
