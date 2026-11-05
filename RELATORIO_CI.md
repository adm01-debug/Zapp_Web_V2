# RELATÓRIO CI — fix-ci-workflows-hxupgs

> Sessão: `https://claude.ai/code/session_01RfQzo6go41Q6ZGmSkVmz7W`  
> Data: 2026-11-05  
> Branch de trabalho: `claude/fix-ci-workflows-hxupgs`

---

## Baseline (início da sessão)

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

## Estado final (2026-11-05)

| Workflow | Estado | Como resolveu |
|---|---|---|
| CI/CD Pipeline | ✅ **VERDE** (run #11129, `fa7d882`) | Autorreparo: commits posteriores corrigiram a flakiness |
| Contexto | ✅ **VERDE** (run #43, `03e9568`) | Autorreparo: erro 500 do GitHub era transitório |
| DB Guard (offline) | ✅ **VERDE** (run #10655, `fa7d882`) | Autorreparo: permissão multiplix resolvida |
| E2E Logado | ✅ **VERDE** (runs #6778/#6779, `fa7d882`) | Autorreparo: timeout de auth era transitório |
| Deploy Edge Functions | ❌ **BLOQUEADO** | Aguarda merge do PR #2707 (ver `PENDENCIAS.md`) |

---

## Resumo

- **4 de 5** workflows com falha foram resolvidos sem intervenção de código — eram falhas transitórias ou reparadas por commits que aterraram na `main` antes desta sessão.
- **1 workflow** (`deploy-functions.yml`) está bloqueado por dependência do PR #2707, que contém migration DDL e toca `supabase/deployment-manifest.json`. Por AGENTS.md regras 3 e 8, não é possível corrigir sem aprovação do dono.
- **Nenhuma regressão** introduzida nesta sessão.
- Instrução ao dono: mergear PR #2707 após revisão; o deploy deverá normalizar automaticamente.
