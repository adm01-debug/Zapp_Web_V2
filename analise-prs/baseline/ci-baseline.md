# CI Baseline — main (2026-10-23)

## SHA de referência
`328a475ca75b421664edacfda79a598e01c77e64`

## Estado dos checks (run #40012407457)

| Check | Estado |
|---|---|
| 🔎 TypeCheck | ✅ success |
| 🔒 Security Audit | ✅ success |
| 🧩 Node CI Scripts | ✅ success |
| Replay local das migrations | ✅ success |
| 🏗️ Build | ⏭️ skipped |
| 🧪 Unit Tests (1/3) | ❌ failure |
| 🧪 Unit Tests (2/3) | ❌ failure |
| 🧪 Unit Tests (3/3) | ❌ failure |
| Contrato DB offline | ❌ failure |
| 🎭 E2E Tests (Playwright) | ⏳ in_progress |
| 🎭 E2E logado (chromium-e2e-core) | ❌ failure |
| 🎭 E2E logado (deslogado-principal) | ❌ failure |
| 🎭 E2E logado (deslogado-secundario) | ⏳ in_progress |

## Conclusão

Main está **VERMELHA** nos required checks. Para merges funcionarem com `strict=true`:
1. PRs #2192, #2193, #2187, #2190 precisam ser mergeadas nessa ordem (são as que corrigem os testes)
2. Após essas, main fica verde → outras PRs BEHIND podem ser mergeadas

## Required checks da main (6 obrigatórios)
1. `🔍 Lint & TypeCheck` — verde
2. `🧪 Unit Tests` — **VERMELHO** (3/3 falhas)
3. `🏗️ Build` — skipped (depende de testes)
4. `🔒 Security Audit` — verde
5. `Contrato DB offline` — **VERMELHO**
6. `🎭 E2E Tests (Playwright)` — in_progress

## PRs que corrigem a main
- **#2192** (1 arquivo): "fix: guarda de vigência do teste RLS do Dashboard" → destrava Contrato DB offline
- **#2193** (2 arquivos): "fix: testes de ChatMessagesArea e FilesTab"
- **#2187** (69 arquivos): "fix(tests): corrige falhas de testes no baseline main"
- **#2190** (92 arquivos): "fix: corrige 9 falhas de CI que mantinham a main vermelha"
