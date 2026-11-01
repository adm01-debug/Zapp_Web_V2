# Baseline CI — main `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

**Data da medição:** 2026-11-01  
**Fonte:** `github_list_check_runs` via FOREVER MCP  
**SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## Checks obrigatórios (3 required checks da branch protection)

| Check | Conclusão | Obs |
|---|---|---|
| `🏗️ Build` | ⏳ `queued`/`in_progress` | Rodando ao momento da medição |
| `🔎 TypeCheck` | ⏳ `queued`/`in_progress` | Rodando ao momento da medição |
| `✅ CI Gate (required check)` | ⏳ `queued`/`in_progress` | Rodando ao momento da medição |

---

## Implicação para a análise de PRs

- CI de `main 1252bb5a` com checks pendentes ao início da análise.
- PRs marcadas como `MERGE_OK_AUTO_MERGE_PENDING` têm `auto_merge=squash` ativo — mergearão quando CI ficar verde.
- PRs com `MERGE_OK` sem auto_merge (#2524) requerem merge manual após CI passar.
- O auto_merge respeita os required checks — quando os 3 checks passarem em cada PR, o squash-merge ocorre automaticamente.

---

## Demais checks (não-obrigatórios ao vivo)

- `🎭 E2E Tests` — rodando; instabilidade histórica em `e2e/catalog.spec.ts` e fixtures com IDs de produção (conforme CLAUDE.md)
- Outros: Vercel Preview, CodeQL, Node CI Scripts, Edge contracts — não são required checks

---

## Nota sobre discrepância de contagem de required checks

CLAUDE.md histórico menciona 6 required checks. PR #2507 corrige esse dado: ao vivo em 2026-11-01 são **3 required checks** (`🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate`). Este baseline usa o valor ao vivo medido.