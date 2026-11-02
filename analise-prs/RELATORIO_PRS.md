# RELATÓRIO DE PRs — adm01-debug/Zapp_Web_V2

**Gerado em:** 2026-11-02  
**SHA main ao início da análise:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Total de PRs analisadas (histórico):** 173  
**PRs abertas ao início desta sessão (2026-11-01):** ~96  
**PRs abertas ao fim da análise (2026-11-02):** 19  

---

## Resumo executivo

| Veredito | Quantidade | PRs |
|---|---|---|
| **MERGE_OK** (auto_merge ativo, aguardando CI) | 4 | #2494, #2504, #2543, #2545 |
| **REGRA8_WORKFLOW** | 14 | #2046, #2092, #2100, #2297, #2450, #2497, #2499, #2502, #2503, #2508, #2510, #2511, #2526, #2527, #2542, #2547 |
| **REGRA8_MIGRATION** | 15 | #2457, #2461, #2466, #2471, #2476, #2481, #2483, #2485, #2486, #2487, #2491, #2496, #2505, #2514, #2533 |
| **REGRA8_EDGE_FUNCTION** | 5 | #2460, #2469, #2472, #2500, #2549 |
| **DRAFT** | 8 | #2515, #2519, #2523, #2525, #2529, #2530, #2531, #2534 |
| **DRAFT_CONFLICTING** | 17 | #2113, #2206, #2245, #2249, #2434–#2446 |
| **DRAFT (outros)** | 3 | #2517 (REGRA8_DESTRUCTIVE_DRAFT), #2539 (DRAFT_MIGRATION_RECONCILE), #2548 (congelamento features) |
| **BLOQUEADO_CI** | 14 | #1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417–#2419, #2421, #2428, #2431, #2433 |
| **CONFLICTING_REBASE** | 46 | (ver progresso.json) |
| **DECISAO_HUMANA_CRITICA** | 1 | #2265 |
| **NOOP** | 3 | #2075, #2086, #2232 |
| **MERGEADAS esta sessão** | 12 | #2071, #2222, #2286, #2384, #2397, #2416, #2420, #2423, #2424, #2425, #2427, #2430 |
| **MERGEADAS por auto_merge** | 2 | #2489, #2493 |
| **MERGEADAS (sessões anteriores)** | 6 | #2034, #2042, #2044, #2340, #2451, #2452 |
| **MERGEADAS (outras sessões)** | 3 | #2482, #2509 + outras |
| **FECHADAS sem merge** | 35+ | (feature freeze, supersedidas, outras sessões) |

---

## PRs abertas em 2026-11-02 (19 total)

### MERGE_OK — auto_merge=SQUASH ativo (4 PRs)

| PR | Título | Branch | Estado |
|---|---|---|---|
| #2494 | fix: unit tests logger mock | `claude/fix-...` | auto_merge=SQUASH, CI queued |
| #2504 | fix: unit tests pinia | `claude/fix-...` | auto_merge=SQUASH, CI queued |
| #2543 | fix: E2E alto-contraste + N-008 healthcheck | `claude/fix-e2e-a11y-contrast-db-guard-n008-011126-2310` | auto_merge=SQUASH, CI queued |
| #2545 | chore: congela features + 9 fluxos críticos | `claude/chore-congelamento-features-261101-2035` | auto_merge=SQUASH, CI queued |

**Status CI (2026-11-02T00:00Z):** GitHub Actions runners queued desde 2026-11-01T22:27Z. Auto_merge dispara automaticamente quando CI verde.

### REGRA8 — Decisão humana obrigatória

| PR | Título | Motivo REGRA8 |
|---|---|---|
| #2527 | fix: auto-update branch target | REGRA8_WORKFLOW — `auto-update-pr-branch.yml` |
| #2542 | fix: N-008 DB Guard N008_POSTGRES_IMAGE | REGRA8_WORKFLOW — `db-guard.yml` |
| #2547 | infra: E2E logado timeout 45 min | REGRA8_WORKFLOW — `e2e-logado.yml` |
| #2549 | fix: reconexão automática WhatsApp via health check | REGRA8_EDGE_FUNCTION — deno test NÃO verificado |

> **Nota crítica #2549:** Implementa reconexão automática do WhatsApp (fluxos 2, 3, 4 quebrados desde 07/10). Bloqueada porque `deno test`/`deno check` não pôde ser executado (deno indisponível no ambiente do autor). O job `🦕 Edge contracts` NÃO é required check — auto_merge passaria mesmo se Edge contracts falhasse.

### DRAFT — Não mergear

| PR | Título | Motivo |
|---|---|---|
| #2539 | fix: reconcilia migrations 20261026 | DRAFT + toca ci.yml + DROP migration |
| #2548 | feat: TalkX X048 estados WA/CRM | DRAFT + feature freeze |

---

## Fluxos críticos de produção (docs/PRONTO_PRODUCAO.md)

| Fluxo | Estado em 2026-11-02 |
|---|---|
| 1. Login e autenticação | ✅ Funcionando |
| 2. Receber mensagem WhatsApp | ❌ QUEBRADO (disconnected desde 07/10) |
| 3. Responder mensagem | ❌ QUEBRADO |
| 4. Reconexão automática WhatsApp | ❌ QUEBRADO — fix na PR #2549 (REGRA8_EDGE_FUNCTION) |
| 5–9 | Estado não verificado nesta sessão |

---

## Merges realizados nesta sessão (2026-11-01 a 2026-11-02)

12 PRs mergeadas via squash (auto_merge): #2071, #2222, #2286, #2384, #2397, #2416, #2420, #2423, #2424, #2425, #2427, #2430.

SHAs exatos disponíveis no histórico de commits do repositório pós-merge.

---

## Ações de segurança realizadas

1. **auto_merge desativado** em #2481, #2508, #2527, #2533, #2549 — eram REGRA8 com auto_merge indevidamente ativo
2. **Worktrees:** nenhum worktree adicional (`git worktree list` = apenas main)
3. **Nenhum push direto em main** — toda escrita via merge squash pelo GitHub

---

## Arquivos de análise

- `analise-prs/RELATORIO_PRS.md` — este arquivo
- `analise-prs/progresso.json` — estado detalhado de todos os 173+ verdicts
- `analise-prs/regras-de-negocio.md` — regras aplicadas na análise
- `analise-prs/baseline/main-1252bb5a-ci-state.md` — estado do CI no SHA inicial
- `analise-prs/baseline/unit-tests-failing.txt` — 136 testes falhando (causa raiz: mock logger removido)
- `analise-prs/dossies/PR-<n>.md` — dossiê individual por PR (265 arquivos)
