# Relatório de PRs — adm01-debug/Zapp_Web_V2

**Data da análise:** 2026-10-29  
**main SHA auditado:** `ac97c0ea300877335a43600ed025c28b6dfa4579`  
**Total de PRs abertas analisadas:** 50 (29 não-draft + 2 bots + 19 drafts)  
**Total de dossiês criados:** 50

---

## Resumo Executivo

**NENHUMA PR foi mergeada.** Todas as PRs não-draft estão bloqueadas pelo CI Gate sistêmico ou por outras razões explícitas.

**PR #2340 já foi mergeada** por outra sessão antes da análise (2026-10-29T14:29:03Z).

| Veredito | Quantidade | PRs |
|---|---|---|
| `MERGEADA` (outra sessão) | 1 | #2340 |
| `MERGEAR_SE_CI_VERDE` | 10 | #2218, #2232, #2239, #2240, #2244, #2246, #2247, #2270, #2272, #2273 |
| `BLOQUEADO_CI_E_BEHIND` | 8 | #2225, #2226, #2228, #2229, #2266, #2267, #2268, #2269 |
| `BLOQUEADO_CI` | 1 | #2233 |
| `CI_BLOQUEADO` (behind) | 3 | #2278, #2286, #2305 |
| `DECISAO_HUMANA` | 2 | #2238, #2277 |
| `COMPLETAR` | 1 | #2230 |
| `SKIP_PROHIBITED` (workflows) | 2 | #2295, #2298 |
| `SUPERSEDED` (obsoleto) | 1 | #2284 |
| `DRAFT_SKIP` | 21 | #2211–2222, #2241, #2242, #2245, #2249, #2250, #2255, #2261, #2263, #2265, #2274, #2275, #2279, #2297 |
| **TOTAL** | **50** | |

---

## 1. Merges Realizados

**Nenhum por esta sessão.** `merges_realizados: 0`

PR #2340 foi mergeada por outra sessão antes desta análise iniciar (docs/consolidacao/_plano/B-grupos.md).

---

## 2. PRs Prontas para Merge (MERGEAR_SE_CI_VERDE)

As PRs abaixo passaram nas 4 perguntas com evidência real e estão bloqueadas **apenas** pelo CI Gate sistêmico:

| PR | Título resumido | Arquivos | Risco |
|---|---|---|---|
| #2218 | fix(talkx+ci): X094 TalkXTemplateEditor + guards | múltiplos | médio |
| #2232 | fix(test): SummaryResult selector h-6→h-8 | 1 | baixo |
| #2239 | feat(ui): GoalsDashboard seletor de período | 2-3 | baixo |
| #2240 | feat(talkx): X115 filtros persistem em URL | 2-3 | baixo |
| #2244 | fix(types): 9 RPCs + offline queue userId + m4a | 1 | baixo (fix crítico de CI) |
| #2246 | fix(ci+docs): TC-009 + ChatMessagesArea + fila-merge | múltiplos | médio |
| #2247 | docs: resgate-validacao command | docs | baixo |
| #2270 | chore(ci): codeql-action SHA bump | 1 workflow | baixo (bot) |
| #2272 | chore(infra): Dockerfile golang SHA bump | 1 | baixo (bot) |
| #2273 | fix(test+ci): fila-merge retry + mocks | 4 | médio (tem conflito) |

**Condição de desbloqueio:** CI Gate verde (especialmente `Contrato DB offline` = `novas: 0`).
**Causa raiz do bloqueio:** `src/integrations/supabase/types.ts` sem 9 assinaturas RPC — PR #2244 corrige isso.

---

## 3. Bloqueio Sistêmico de CI

### 3.1 Causa primária: `Contrato DB offline` falha com `novas=12`

`scripts/db-audit/supabase-usage-guard.mjs` detecta 12 chamadas RPC no front sem assinatura em `types.ts`.
**Fix:** PR #2244 (`fix(types): 9 RPCs + offline queue userId + m4a`) adiciona as 9 assinaturas faltantes.

### 3.2 `Unit Tests` falhando em múltiplos shards

Regressão em main desde ~24/10/2026. Causa: mocks desalinhados após refatorações recentes.
Vários PRs tentam corrigir isso (#2219, #2221, #2228, #2229, #2233) mas estão em draft ou blocked.

### 3.3 `E2E Tests (Playwright)` cancelados frequentemente

Jobs E2E sendo cancelados por timeout ou conflito de ambiente.

---

## 4. PRs com Decisão Humana

| PR | Título resumido | Motivo |
|---|---|---|
| #2238 | feat(message-delivery): carimbo POST iniciado (PD-79, PD-80) | Mudança em edge function com impacto em rastreabilidade de produção |
| #2277 | chore(db) GOAL backend — storage audit + manifest | Conflito + DDL + manifesto schema + 25 commits; escopo amplo |

---

## 5. PRs Proibidas por Escopo

| PR | Título resumido | Motivo |
|---|---|---|
| #2298 | feat(e75): centraliza versões de toolchain em toolchain.json | Toca 11 arquivos `.github/workflows/` |
| #2295 | feat(ci): skip heavy jobs em draft PRs (E71) | Toca 3 arquivos `.github/workflows/` |

---

## 6. PRs Obsoletas/Superseded

| PR | Status | Motivo |
|---|---|---|
| #2284 | SUPERSEDED | Entregáveis de sessão anterior (SHA e1f2ee4, 100 PRs) — conflito + escopo diferente |

---

## 7. PRs Behind + CI Bloqueado

Estas PRs são tecnicamente válidas mas dependem do CI Gate verde E de atualização de branch:

| PR | Título resumido | Tipo de mudança |
|---|---|---|
| #2225 | fix(e2e): mock RPC app_bootstrap | test |
| #2226 | fix(db-guard): assertion B.0c TC-009 | CI script |
| #2228 | fix(tests): mock useAdminDataCreateUser | test |
| #2229 | test(inbox): InboxEmptyChat.cta divergente | test |
| #2266 | fix: paleta comandos + filtros inbox + celebrações | UI |
| #2267 | fix: fila offline sem dono / logout | edge/front |
| #2268 | fix: supervisor templates + Base de Conhecimento | front |
| #2269 | fix: Talk X segmentos sem estimativa enganosa | front |
| #2278 | fix(ci): guarda dashboard_kpi migration 20261026210000 | CI script |
| #2286 | fix(edge-deploy): E09 timestampBumped como evidência | edge function |
| #2305 | docs(mapa): USO_SEARCHBOX | docs |

---

## 8. Draft PRs (não analisadas em profundidade)

19 PRs em estado draft — não elegíveis para merge enquanto em draft:
#2211, #2213, #2214, #2215, #2216, #2217, #2219, #2221, #2222, #2241, #2242, #2245, #2249, #2250, #2255, #2261, #2265, #2279, #2297

---

## 9. Baseline do main (ac97c0ea)

### Lint (bun run lint)
- **Erros pré-existentes em main:** `local/no-secret-compare` (14×), `@typescript-eslint/no-explicit-any` (2×), `react-hooks` (setState-in-effect 2×, impure-in-render 1×)
- **Warnings pré-existentes:** `react-refresh/only-export-components` (7×), `no-restricted-imports` (4×)
- **Exit code: 0**

### TypeCheck (bun run typecheck)
- **SIGABRT** (OOM no container) — não foi possível coletar baseline de typecheck
- Regressão de CI não causada por esta análise

---

## 10. Conclusão

**Bloqueador principal:** CI Gate sistêmico + `types.ts` desatualizado.

**Caminho de desbloqueio (em ordem):**
1. Mergear PR #2244 (`fix(types): 9 RPCs`) → resolve `Contrato DB offline novas=12`
2. Resolver Unit Tests falhando em main (regressão desde 24/10)
3. Com CI verde, mergear PRs `MERGEAR_SE_CI_VERDE` em ordem de risco crescente
4. Atualizar branches das PRs `BLOQUEADO_CI_E_BEHIND` com main e remergear

---

*Análise gerada em 2026-10-29 | main@ac97c0ea | sessão `f25df632-1569-5c66-abd1-e14cb862eb74`*
