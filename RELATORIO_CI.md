# RELATÓRIO CI — fix-ci-workflows-hxupgs

> Sessão: `https://claude.ai/code/session_01RfQzo6go41Q6ZGmSkVmz7W`  
> Data: 2026-11-05  
> Branch de trabalho: `claude/fix-ci-workflows-hxupgs`

---

## 1. Baseline local (comandos rodados nesta sessão)

Todos os comandos foram executados no container da sessão em `/home/user/Zapp_Web_V2`.

### 1.1 Instalação de dependências

```
bun install --frozen-lockfile
# Resultado: bun install v1.x — Resolving dependencies... Done
# exit 0
```

### 1.2 Build de produção

```
bun run build
# vite v5.x building for production...
# ✓ built in ~20s
# exit 0
```

### 1.3 TypeCheck

```
npx tsc --noEmit -p tsconfig.app.json
# (sem erros de tipo)
# exit 0
```

### 1.4 ESLint (arquivos do projeto)

```
npx eslint src/ --ext .ts,.tsx --max-warnings 0
# (sem warnings nem erros novos introduzidos nesta sessão)
# exit 0
```

### 1.5 Integridade do CLAUDE.md

```
node scripts/ci/check-claude-md-integrity.mjs
# OK — seções 0–3 presentes, sem redução > 30%
# exit 0
```

### 1.6 Supabase usage guard

```
node scripts/db-audit/supabase-usage-guard.mjs
# novas violações: 0
# exit 0
```

### 1.7 Node CI unit tests

```
node --test scripts/ci/*.unit.mjs 2>&1 | tail -10
# 1..4132
# tests 4275
# suites 6
# pass  4273
# fail  0
# cancelled 0
# skipped 2
# todo  0
# duration_ms 406644
# CI_UNIT_EXIT:0
# exit 0
```

### 1.8 Vitest (suíte unitária)

Vitest foi iniciado em background (`npx vitest run --reporter=verbose`). O processo foi encerrado pelo timeout da sessão antes de concluir (a suíte completa leva ~90s). O CI remoto rodou `🧪 Unit Tests` com sucesso no run #11129 (`fa7d882`) — evidência de que a suíte passa na main.

---

## 2. Inventário de workflows com falha no baseline

Consulta: últimas 50 runs com `conclusion=failure` na `main`.
Workflows únicos com falha encontrados: **5**

| Workflow | Última run com falha | SHA | Motivo |
|---|---|---|---|
| CI/CD Pipeline (`ci.yml`) | #11112 | `451373f5` | Flaky webkit: timeout no teste `e2e/email-navy-visual.spec.ts` |
| Contexto (`contexto.yml`) | #42 | `03e9568` | Erro 500 transitório do GitHub Push API |
| DB Guard (`db-guard.yml`) | #10654 | `fa7d882` | Permissão multiplix |
| Deploy Edge Functions (`deploy-functions.yml`) | #956 | `afd8c7ca` | Manifesto desatualizado (edge `ai-usage-outbox-drain` ausente) |
| E2E Logado (`e2e-logado.yml`) | #1489 | `451373f5` | Timeout de auth setup (`AUTH_LOGIN_TIMEOUT_MS`) — transitório |

---

## 3. Estado final (2026-11-05)

| Workflow | Estado | Como resolveu |
|---|---|---|
| CI/CD Pipeline | ✅ **VERDE** (run #11129, `fa7d882`) | Autorreparo: commits posteriores corrigiram a flakiness |
| Contexto | ✅ **VERDE** (run #43, `03e9568`) | Autorreparo: erro 500 do GitHub era transitório |
| DB Guard | ✅ **VERDE** (run #10655, `fa7d882`) | Autorreparo: permissão multiplix resolvida |
| E2E Logado | ✅ **VERDE** (runs #6778/#6779, `fa7d882`) | Autorreparo: timeout de auth era transitório |
| Deploy Edge Functions | ❌ **BLOQUEADO** | Aguarda merge do PR #2707 (ver `PENDENCIAS.md`) |

---

## 4. Deploy Edge Functions — detalhe do bloqueio

- **Workflow:** `.github/workflows/deploy-functions.yml`
- **Última run:** #956, commit `afd8c7ca`, `conclusion=failure`
- **Erro exato:** `Deployment manifest is stale: supabase/deployment-manifest.json`
- **Causa:** PR #2707 adicionou a edge `ai-usage-outbox-drain` mas não foi mergeada; o manifesto ficou desatualizado.
- **Por que a run #956 é o estado atual:** os commits entre `afd8c7ca` e `fa7d882` (HEAD da main) não alteraram `supabase/functions/` nem `supabase/config.toml`, portanto o workflow não foi disparado novamente.
- **Por que não corrijo:** PR #2707 toca `supabase/deployment-manifest.json` (AGENTS.md regra 3) **e** contém migration DDL (AGENTS.md regra 8). Não é possível corrigir sem aprovação do dono.
- **Ação necessária:** dono mergeiar PR #2707; deploy normalizará automaticamente.

---

## 5. Baseline × estado final

| Verificação | Baseline | Final |
|---|---|---|
| `bun install` | ✅ exit 0 | ✅ sem regressão |
| `bun run build` | ✅ exit 0 | ✅ sem regressão |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ sem regressão |
| `npx eslint` | ✅ exit 0 | ✅ sem regressão |
| `node --test scripts/ci/*.unit.mjs` | ✅ 4273/4275 pass, exit 0 | ✅ sem regressão |
| `check-claude-md-integrity` | ✅ exit 0 | ✅ sem regressão |
| `supabase-usage-guard` | ✅ 0 violações | ✅ sem regressão |
| Workflows com falha na main | 5 | 1 (bloqueado por PR externa) |

**Nenhuma regressão introduzida nesta sessão.**
