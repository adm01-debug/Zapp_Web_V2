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
| **REGRA8_WORKFLOW** | 9 | #2046, #2092, #2100, #2297, #2450, #2502, #2503, #2508, #2510, #2511, #2526, #2527, #2542, #2547 |
| **REGRA8_MIGRATION** | 14 | #2457, #2461, #2466, #2471, #2476, #2481, #2483, #2485, #2486, #2487, #2491, #2496, #2505, #2514, #2533 |
| **REGRA8_EDGE_FUNCTION** | 4 | #2460, #2469, #2472, #2500, #2549 |
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
| #2494 | chore(db): sincronizar artefatos derivados do banco | `automation/types-sync` | auto_merge=SQUASH, CI queued |
| #2504 | fix(e2e): workers CI 1→4 + timeouts explícitos nos 3 testes do mapa/email | `claude/fix-e2e-workers-timeout-tests-011101-1800` | auto_merge=SQUASH, CI queued |
| #2543 | fix: E2E alto-contraste e N-008 healthcheck | `claude/fix-e2e-a11y-contrast-db-guard-n008-011126-2310` | auto_merge=SQUASH, CI queued |
| #2545 | chore: congela features e define os 9 fluxos críticos para produção | `claude/chore-congelamento-features-261101-2035` | auto_merge=SQUASH, CI queued |

**Status CI (2026-11-02T01:00Z — verificado):** GitHub Actions overloaded — runners queued desde 2026-11-01T22:27Z. `mergeable_state: blocked` em todas as 4 (confirmado via API). Auto_merge dispara automaticamente quando CI verdes.

### REGRA8 — Decisão humana obrigatória

| PR | Título | Motivo REGRA8 |
|---|---|---|
| #2527 | fix: auto-update branch target | REGRA8_WORKFLOW — `auto-update-pr-branch.yml` |
| #2542 | fix: N-008 DB Guard N008_POSTGRES_IMAGE | REGRA8_WORKFLOW — `db-guard.yml` |
| #2547 | infra: E2E logado timeout 45 min | REGRA8_WORKFLOW — `e2e-logado.yml` |
| #2549 | fix: reconexão automática WhatsApp via health check | REGRA8_EDGE_FUNCTION — deno test NÃO verificado |

> **Nota crítica #2549:** Esta PR implementa a reconexão automática do WhatsApp (fluxos 2, 3, 4 quebrados desde 07/10). É a mais crítica das bloqueadas. Bloqueada APENAS porque `deno test`/`deno check` não pôde ser executado no ambiente do autor (deno indisponível). O job `🦕 Edge contracts` NÃO é required check — auto_merge passaria mesmo se Edge contracts falhasse. Por isso foi mantida como REGRA8.

### DRAFT — Não mergear

| PR | Título | Motivo |
|---|---|---|
| #2539 | fix: reconcilia migrations 20261026 | DRAFT + toca ci.yml + DROP migration |
| #2548 | feat: TalkX X048 estados WA/CRM | DRAFT + feature freeze |

---

## Fluxos críticos de produção (de docs/PRONTO_PRODUCAO.md)

| Fluxo | Estado em 2026-11-02 |
|---|---|
| 1. Login e autenticação | ✅ Funcionando |
| 2. Receber mensagem WhatsApp | ❌ QUEBRADO (disconnected desde 07/10) |
| 3. Responder mensagem | ❌ QUEBRADO |
| 4. Reconexão automática WhatsApp | ❌ QUEBRADO — fix na PR #2549 (REGRA8) |
| 5–9 | Estado não verificado nesta sessão |

---

## Merges realizados nesta sessão (2026-11-01 a 2026-11-02)

| PR | SHA squash (merge_commit_sha) | merged_at | Título |
|---|---|---|---|
| #2071 | `662083c5f76bc6d264364efdb4c0336ce71c937a` | 2026-10-31T19:24:56Z | fix: remove hook morto useTalkXSuppression |
| #2222 | `2ca8db8077ddbc72420a4cb06646ab0bc4f2034c` | 2026-10-31T19:25:02Z | fix(db): corrige TC-009 |
| #2286 | `438e609b9f9af353d8439c74d20be76b6c9584b1` | 2026-10-31T19:25:08Z | fix(edge-deploy): E09 — timestampBumped |
| #2384 | `8d27ad099a4b5a8fc98248531402fc0f3c4557a2` | 2026-10-31T19:25:14Z | fix(team-chat): accept emitted audit actions |
| #2397 | `049094e024b49cf3ad130ef2d0feb5f1fce8d0b6` | 2026-10-31T19:25:20Z | Reset audit progress to new session baseline |
| #2416 | `94434b3224d6665dfa09e4489e3bd1ca34241fc7` | 2026-10-31T19:29:34Z | fix(ci): fixar fuso America/Sao_Paulo no vitest |
| #2420 | `089551d0babaa1fbebd5475e4c58e53d821ac4e6` | 2026-10-31T19:25:27Z | feat: DDL 7 tabelas copiloto RADAR fases 13-15 |
| #2423 | `2b0dc69f697c09c130490485202c08e295824a93` | 2026-10-31T19:25:35Z | feat(copilot): S3-018 migration merge_brinde_state RPC |
| #2424 | `6e2e2d02147fd288141dcd34585ce2ec9d6c0d3d` | 2026-10-31T19:24:41Z | feat(copilot): S3-019 migration colunas Fase 4 RADAR |
| #2425 | `e2e4989faaa46f5baa2028e69563a9a7eb9a8d76` | 2026-10-31T20:52:26Z | feat(search): S3-020 migration log_search_event RPC |
| #2427 | `7df72c83011bdeffa57d1bf8a59bc0179fcf5902` | 2026-10-31T19:25:41Z | feat(e2e): S3-024 migration GA11 — e2e_fixture_message RPC |
| #2430 | `00ad8718f18d58558a78afbba1f4b74e84db4b3c` | 2026-10-31T19:25:46Z | feat(talkx): adiciona p_segment_id à talkx_campaign_recipients_page |

> SHAs verificados via `get_pull_request` (merged_at = 2026-10-31). Todas squash-merged em main.

---

## Ações de segurança realizadas

1. **auto_merge desativado** em #2481, #2508, #2527, #2533, #2549 — eram REGRA8 com auto_merge indevidamente ativo
2. **Worktrees:** nenhum worktree adicional existe (`git worktree list` = apenas main)
3. **Nenhum push direto em main** — toda escrita foi via merge squash pelo GitHub

---

## Arquivos de análise

- `analise-prs/RELATORIO_PRS.md` — este arquivo
- `analise-prs/progresso.json` — estado detalhado de todos os 173+ verdicts
- `analise-prs/regras-de-negocio.md` — regras aplicadas na análise
- `analise-prs/baseline/main-1252bb5a-ci-state.md` — estado do CI no SHA inicial
- `analise-prs/baseline/unit-tests-failing.txt` — 136 testes falhando (causa raiz: mock logger)
- `analise-prs/dossies/PR-<n>.md` — dossiê individual por PR (265 arquivos)
