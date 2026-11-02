# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Gerado em:** 2026-11-02  
**SHA main no início:** `004e74a8c596959f45f61c8b0b64b30a70c1ff19`  
**SHA main atual:** `dfef2487a2c3b86101f23ef50d2c1d862b4fe03a` (após PR #2549)  
**Total de PRs analisadas:** 98  

---

## Resumo por veredito

| Veredito | Quantidade |
|---|---|
| FECHADA_SEM_MERGE | 66 |
| **MERGEADA** | **11** |
| AGUARDANDO_CI | 4 |
| BLOQUEADO_CONFLITO | 6 |
| DRAFT_SKIP | 5 |
| BLOQUEADO_AGUARDANDO_APROVACAO | 2 |
| BLOQUEADO_DDL_WORKFLOW | 1 |
| BLOQUEADO_RLS_SEM_TESTE | 1 |
| BLOQUEADO_FEATURE_FREEZE | 1 |
| BLOQUEADO_DECISAO_HUMANA | 1 |
| **TOTAL** | **98** |

---

## PRs Mergeadas (11)

| PR | SHA merge | Data | Título |
|---|---|---|---|
| #2283 | `6271b716` | 2026-10-27 | fix: aumentar timeout job E2E 20→45 min |
| #2447 | `3617a2ac` | 2026-11-01 | docs(ci): RELATORIO_CI.md e PENDENCIAS.md |
| #2482 | `3b5f8a96` | 2026-11-01 | docs(talkx): marca V4 vigente e V3 substituído |
| #2547 | `3066fac0` | 2026-11-02T02:13Z | infra: E2E logado timeout 45 min |
| #2560 | `a7a53f56` | 2026-11-02T02:43Z | fix(e2e): workers 1→2 em CI — GR-016 |
| #2545 | `c16f3c69` | 2026-11-02T03:01Z | chore: congela features e define 9 fluxos críticos |
| #2567 | `8ba0b436` | 2026-11-02T03:51Z | fix(ci): deno install --frozen=false |
| #2543 | `3e6ed32a` | 2026-11-02T04:16Z | fix: E2E alto-contraste e N-008 healthcheck |
| #2569 | `50ca61a6` | 2026-11-02T04:43Z | fix(ci): testes GR-027 + gatilho e2e-logado GR-029 |
| #2522 | `4b5c6e79` | 2026-11-02T05:20Z | fix(e2e): aguarda teclado visível antes do clique — Firefox GR-012 |
| #2549 | `dfef2487` | 2026-11-02T05:32Z | fix: reconexão automática WhatsApp pelo health check |

**Pós-merge CI:** todos os 11 merges entraram via auto_merge=squash com CI Gate = success (ou CI Gate passando em run precedente confirmado).

---

## PRs Aguardando CI (4)

| PR | Status | Detalhe |
|---|---|---|
| #2557 | blocked | fix(docs): atualiza required checks no CLAUDE.md (GR-011) — CI rodando |
| #2570 | blocked | fix: RLS department_invites — CI rodando (Contrato DB + Replay in_progress) |
| #2498 | behind→updated | fix(admin): RPC get_search_insights→search_insights — branch atualizado 05:35Z |
| #2494 | aguardando | db-inventory-doc falha: 7 tabelas copilot_* ausentes de DB-INVENTORY.md — bloqueio estrutural (ver §Pendências) |

---

## PRs com Conflito (6)

| PR | Motivo |
|---|---|
| #2526 | dirty após main avançar |
| #2533 | dirty após main avançar |
| #2536 | supersedido por #2560 (já mergeada) |
| #2542 | dirty após main avançar |
| #2563 | dirty após #2567 mergear o mesmo fix |
| #2571 | dirty + auto_merge ativo com conflito pendente |

---

## PRs Bloqueadas por Aprovação Humana (2)

| PR | Motivo |
|---|---|
| #2481 | DDL RLS WITH CHECK explícito em 8 policies UPDATE — requer aprovação do Joaquim (regra 8 CLAUDE.md) |
| #2561 | DDL RLS department_invites — requer aprovação |

---

## PRs Bloqueadas por Outras Razões

| PR | Veredito | Motivo |
|---|---|---|
| #2496 | BLOQUEADO_DDL_WORKFLOW | feature freeze + DDL sem aprovação |
| #2551 | BLOQUEADO_RLS_SEM_TESTE | 3 migrations RLS sem testes Postgres |
| #2562 | BLOQUEADO_FEATURE_FREEZE | feat(lgpd) — feature nova fora do freeze |
| #2565 | BLOQUEADO_DECISAO_HUMANA | conflita com #2557 em CLAUDE.md — Joaquim decide qual mergear |

---

## Pendências (requerem Joaquim)

### §1 — PR #2481: DDL RLS WITH CHECK
- Fix de segurança: policies UPDATE sem WITH CHECK em 8 tabelas críticas
- Requer aprovação do Joaquim por ser DDL em produção (CLAUDE.md §1 regra 8)

### §2 — PR #2561: DDL RLS department_invites
- Requer aprovação do Joaquim

### §3 — PR #2565: CLAUDE.md conflita com #2557
- Dois PRs tocam CLAUDE.md; Joaquim decide qual versão manter

### §4 — PR #2494: DB-INVENTORY.md desatualizado
- `db-inventory-doc.unit.mjs:406` falha porque 7 tabelas `copilot_*` existem no banco mas não em `docs/DB-INVENTORY.md`
- O `types-sync.yml` não regenera DB-INVENTORY.md (regenera só `types.ts` e `schema-catalog.json`)
- Solução: criar step em `types-sync.yml` que atualize DB-INVENTORY.md automaticamente — ou atualizar manualmente o arquivo com as 7 tabelas

---

## Baseline antes × depois

| Métrica | Baseline (SHA `4b5c6e79`) | Pós 11 merges |
|---|---|---|
| TypeCheck (`tsc --noEmit`) | exit=0, novas=0 vs baseline 93 | CI Gate verde em todos |
| Lint (lint-ratchet) | novas=0 vs baseline 820 | CI Gate verde em todos |
| Build | ✅ passando | ✅ passando |
| Unit Tests | ✅ passando (1 flake conhecido) | ✅ passando |
| E2E Tests | ✅ passando | ✅ passando |
| Migrations | 1073 .sql, paridade OK | paridade mantida |

---

## PRs Fechadas sem Merge (66)

PRs #1930, #1997, #2051, #2078, #2091, #2095, #2097, #2107, #2111, #2113, #2137, #2146, #2186, #2206, #2233, #2238, #2245, #2249, #2265, #2277, #2279, #2417, #2418, #2426, #2428, #2431, #2445, #2457, #2460, #2461, #2462, #2463, #2465, #2466, #2468, #2469, #2471, #2472, #2473, #2475, #2476, #2478, #2479, #2480, #2483, #2484, #2485, #2486, #2487, #2489, #2491, #2492, #2493, #2495, #2497, #2499, #2500, #2501, #2502, #2503, #2504, #2505, #2552, #2559, #2564, #2566

---

## Arquivos desta análise

- `analise-prs/prs.json` — inventário completo com vereditos
- `analise-prs/prs.csv` — mesma informação em CSV
- `analise-prs/progresso.json` — rastreamento de sessão
- `analise-prs/baseline/BASELINE.md` — evidências de build/typecheck/lint
