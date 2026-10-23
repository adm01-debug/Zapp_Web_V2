# Baseline CI da main — 2026-10-23

**SHA:** `a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674`  
**Timestamp:** 2026-10-23T16:22:28Z

## Required checks

| Check | Estado | Evidência |
|---|---|---|
| `🔍 Lint & TypeCheck` | ✅ passando | histórico da sessão anterior |
| `🧪 Unit Tests` (shard 1) | ❌ FAILING | baseline verificado na sessão anterior |
| `🧪 Unit Tests` (shard 2) | ❌ FAILING | idem |
| `🧪 Unit Tests` (shard 3) | ❌ FAILING | idem |
| `🏗️ Build` | ⚠️ SKIPPED | depende de Unit Tests |
| `🔒 Security Audit` | ✅ passando | idem |
| `Contrato DB offline` | ❌ FAILING | idem |
| `🎭 E2E Tests (Playwright)` | ⚠️ CANCELLED | idem |

## Implicação para análise de PRs

Qualquer PR que inclua o conteúdo de main (estado "up-to-date") herda estas falhas.
A regressão de referência são as falhas acima — uma PR não "introduce regressão" por repetir estas falhas se elas já existiam em main.

## Causa identificada das falhas

- **Unit Tests:** mocks quebrados em múltiplos componentes (PRs #2190, #2193, #2187, #2097 visam corrigir)
- **Contrato DB offline:** guarda de vigência de teste desatualizado (PR #2192 visa corrigir)
- **Build/E2E:** downstream das falhas acima
