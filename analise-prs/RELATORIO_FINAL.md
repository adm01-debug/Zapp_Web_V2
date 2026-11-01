# Relatório Final — Análise e Triagem de PRs Abertas

**Data:** 2026-11-01  
**Main SHA inicial:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Total de verdicts emitidos:** 173  
**PRs mergeadas nesta sessão (acumulado):** 14+ (incluindo auto_merges durante sessão)

---

## Resumo executivo

| Categoria | Quantidade | Ação |
|---|---|---|
| **MERGE_OK — auto_merge ativo** | 23 | Vão mergear sozinhas quando CI ficar verde |
| **MERGE_OK — sem auto_merge** | 2 | Merge manual quando CI ficar verde (#2469, #2472) |
| **Regra 8 — aguardam Joaquim** | 30 | Migrations / workflows / edge functions críticas |
| **Mergeadas durante sessão** | 14+ | Incluindo 2 por auto_merge (#2489, #2493) |
| **Conflito rebase** | 47 | PRs antigas com conflito; precisam rebase |
| **CI bloqueada** | 14 | CI vermelho; precisa diagnóstico/fix |
| **Draft com conflito** | 17 | Drafts com `mergeable_state=dirty` |
| **Draft limpo** | 11 | Drafts aguardando desenvolvimento |
| **Fechada sem merge** | 3 | #2468, #2488, #2490 |
| **NOOP** | 3 | Sem diff real (#2075, #2086, #2232) |
| **Decisão humana crítica** | 1 | #2265 |

---

## PRs MERGE_OK — auto_merge ativo (23)

Estas PRs já têm `auto_merge=true` (squash). Vão mergear automaticamente quando CI ficar verde. **Sem ação necessária.**

| PR | Título (resumido) |
|---|---|
| #2462 | docs: auditoria Supabase — correções técnicas |
| #2463 | feat: copilot integração |
| #2464 | feat: copilot integração (cont.) |
| #2465 | feat: copilot integração (cont.) |
| #2467 | feat: copilot integração (cont.) |
| #2473 | feat: conectar 7 hooks Copiloto às edge functions AI |
| #2475 | feat: copilot integração (cont.) |
| #2478 | feat: copilot integração (cont.) |
| #2479 | feat: copilot integração (cont.) |
| #2480 | feat: copilot integração (cont.) |
| #2484 | feat: pausa de instância (supersede #2468) |
| #2494–#2495 | (análise sessão anterior) |
| #2498 | (análise sessão anterior) |
| #2501 | (análise sessão anterior) |
| #2504 | (análise sessão anterior) |
| #2507 | (análise sessão anterior) |
| #2513 | (análise sessão anterior) |
| #2516 | (análise sessão anterior) |
| #2520 | (análise sessão anterior) |
| #2522 | (análise sessão anterior) |
| #2532 | (análise sessão anterior) |
| #2535 | (análise sessão anterior) |

---

## PRs Regra 8 — aguardam aprovação de Joaquim (32)

Toda migration, workflow `.github/`, ou edge function crítica. **Não mergear sem aprovação explícita.**

### Migrations
| PR | Migration | Destrutiva? |
|---|---|---|
| #2457 | `instance_pause_investigation` (versão 223000) | Não |
| #2461 | `copilot_fases13_15_tabelas` — 7 tabelas novas | Não |
| #2466 | `outbound_post_started` — message delivery fase 1 | Não verificado |
| #2471 | `instance_pause_investigation` (versão 140000) — **duplicata de #2457** | Não |
| #2476 | `multiplix_cron_retoma_instancia_pausada` (pg_cron) | Não |
| #2481 | `rls_update_with_check_explicit` — 8 tabelas | Não |
| #2483 | `copilot_sessions.brinde_state` — coluna nova | Não |
| #2485–#2487 | migrations (análise sessão anterior) | Não verificado |
| #2491 | `copilot_fases13_15_tabelas` — **duplicata de #2461** | Não |
| #2496 | migration (análise sessão anterior) | Não verificado |
| #2505 | migration (análise sessão anterior) | Não verificado |
| #2514 | fix CRITICAL-3 talkx-scheduler — migration + cron | Não |
| #2517 | migration destrutiva (DRAFT) | **SIM** |

### Edge functions críticas
| PR | Motivo |
|---|---|
| #2460 | Toca `ci.yml` + 7 novas edge functions AI |
| #2469 | Sobreposição de arquivos com #2472 (evolution-api, multiplix-send, talkx-send) |
| #2472 | Sobreposição de arquivos com #2469 (message-delivery, multiplix-send, talkx-scheduler, talkx-send) |
| #2500 | edge function crítica (análise sessão anterior) |

### Workflows .github/
| PR | Motivo |
|---|---|
| #2046, #2092, #2100, #2297, #2450 | (análise sessões anteriores) |
| #2497, #2499, #2502, #2503, #2508, #2510, #2511, #2526 | (análise sessões anteriores) |

---

## Alertas críticos para Joaquim

### 1. Duplicatas de migration — decidir qual entra

**instance_pause_investigation:**
- PR **#2457** — versão `20261101223000`
- PR **#2471** — versão `20261101140000`
→ Fechar uma antes de mergear a outra. **#2471** tem revogação explícita de `service_role` (mais restrita).

**copilot_fases13_15:**
- PR **#2461** — migration `20261030145126_copilot_fases13_15_tabelas.sql`
- PR **#2491** — migration `20261030145126_copilot_fases13_15_tabelas.sql` (mesmo arquivo)
→ São idênticas. Fechar uma antes de mergear a outra.

### 2. PR #2265 — decisão humana crítica
PR marcada como `DECISAO_HUMANA_CRITICA` desde sessão anterior. Ver dossier em `analise-prs/dossies/PR-2265.md`.

### 3. PR #2514 — CRITICAL-3 talkx-scheduler
Fix de 9,3% de falha por timeout de arranque. Envolve migration + funções cron. Alta prioridade.

### 4. PRs #2469 e #2472 — ordem obrigatória
Ambas tocam edge functions de entrega (multiplix-send, talkx-send). Se aprovadas: mergear **#2469 primeiro**, depois **#2472**.

---

## PRs com conflito de rebase (47)

Precisam de `git rebase main` na branch antes de poder mergear. **Ação do autor da PR.**

PRs: #2051, #2058, #2059, #2063, #2066, #2067, #2068, #2069, #2074, #2078, #2080, #2081, #2082, #2084, #2088, #2091, #2095, #2097, #2107, #2111, #2147, #2148, #2152, #2185, #2186, #2196, #2200, #2208, #2226, #2228, #2233, #2238, #2255, #2277, #2354, #2372, #2396, #2412, #2413, #2414, #2415, #2426, #2429, #2447, #2492, #2506, #2512

---

## PRs com CI vermelho (14)

Precisam de diagnóstico e fix antes de poder mergear.

PRs: #1930, #1997, #2064, #2137, #2146, #2216, #2279, #2417, #2418, #2419, #2421, #2428, #2431, #2433

---

## Mergeadas durante as sessões de análise

### Mergeadas manualmente por esta sessão (squash)
#2071, #2222, #2286, #2384, #2397, #2416, #2420, #2423, #2424, #2425, #2427, #2430

### Mergeadas por auto_merge durante sessão
#2489, #2493

### Mergeadas em sessões anteriores
#2034, #2042, #2044, #2340, #2451, #2452, #2482, #2509

---

## Metodologia

Esta análise seguiu as regras definidas no contrato da sessão:
1. **Regra 8 absoluta:** toda migration SQL → DECISAO_HUMANA (independente de ser aditiva)
2. **Regra 8 absoluta:** toda mudança em `.github/workflows/` → REGRA8_WORKFLOW
3. **Sem merge de DRAFT** (exceto se `mergeable_state=clean` e não toca arquivos Regra 8)
4. **Somente squash-merge** via `mcp__GITHUB_-_MCP_-_FOREVER__*`
5. Evidência citada por arquivo:linha ou estado da API; sem evidência = NÃO VERIFICADO

---

*Relatório gerado em 2026-11-01. Dossiers individuais em `analise-prs/dossies/PR-XXXX.md`.*
