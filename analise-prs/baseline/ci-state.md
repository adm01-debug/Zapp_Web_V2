# Baseline CI — main @ a9ddd2f (2026-10-23)

## Estado dos required checks na main

| Check | Estado |
|---|---|
| 🔍 Lint & TypeCheck | ✅ passou |
| 🧪 Unit Tests | ❌ **FALHOU** — 3 testes vermelhos |
| 🏗️ Build | ⏭️ skipped (dependente de Unit Tests) |
| 🔒 Security Audit | ✅ passou |
| Contrato DB offline | ❌ **FALHOU** |
| 🎭 E2E Tests (Playwright) | ⏭️ cancelled |

**CI do main está RED.** Dois dos 6 required checks estão falhando.

## Impacto para PRs

- Qualquer PR BEHIND que for atualizado para main herdará os failures de Unit Tests e Contrato DB offline.
- Portanto, nenhuma PR BEHIND pode se tornar CLEAN enquanto o CI do main não for corrigido.
- PRs DIRTY têm conflitos adicionais.
- **0 PRs estão CLEAN = 0 PRs podem ser mergeadas agora.**

## Fonte

Último workflow run observado em main (`a9ddd2f`): CI run verificado na sessão de análise.
