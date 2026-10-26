# Relatório CI — Correções de Workflows com Falha

**Data:** 2026-10-26  
**Branch:** `claude_04/nice-cori-7snz6b`  
**Sessão:** https://claude.ai/code/session_01P12Q8mnhJbxDoQh5dUYAgj

---

## Baseline — último estado antes das correções

| Workflow | Último run em `main` | Estado |
|---|---|---|
| CI (ci.yml) | run na `main` | ✅ Verde (lint, typecheck, build, security, DB offline, E2E passando) |
| db-guard (db-guard.yml) | run na `main` | ✅ Verde |
| types-sync (types-sync.yml) | último dispatch | ❌ Falha — ratchet de tipos: `novas=12` (9 funções RPC sem assinatura em `types.ts`) |
| db-live-guard (db-live-guard.yml) | diário | ❌ Falha — 7 jobs falham por divergência entre artefatos do repo e banco de produção |
| auto-update-pr-branch | gatilhado por push | ✅ Verde (workflow de infraestrutura) |
| branch-hygiene-audit | semanal | ⚠️ Flaky — `actions-kpi.mjs` falha com HTTP 502 transitório em `fetch()` |
| fila-merge (fila-merge.mjs) | gatilhado por PR | ⚠️ Flaky — `execFileSync` ao `gh` CLI falha com HTTP 502 sem retry |

---

## Falhas encontradas e causa raiz

### 1. `types-sync` — `novas=12` (bloqueante)

**Causa raiz:** 9 funções RPC existem em produção (`tnnnlkbymytvtqngbbqh`) mas não têm assinatura em `src/integrations/supabase/types.ts`. O ratchet de tipos conta cada função ausente como "nova violação" → `novas=12` → falha.

Funções faltando:
- `admin_list_cron_jobs`
- `admin_toggle_cron_job`
- `app_bootstrap`
- `enqueue_group_outbound_message`
- `inbox_unread_total`
- `search_email_threads`
- `transfer_conversation` (overload duplo)
- `warroom_agent_today`
- `warroom_queue_stats`

**Fix aplicado:** Adicionadas 9 assinaturas em `src/integrations/supabase/types.ts` (puramente aditivo — zero remoções, zero alterações em assinaturas existentes). Conteúdo copiado do branch `fix/types-rpc-ausentes-261025` (PR #2244), que adicionou exatamente essas mesmas assinaturas.

### 2. Flake HTTP 502 em `scripts/ci/fila-merge.mjs`

**Causa raiz:** `execFileSync` chamando `gh pr list` e `gh api compare` sem nenhum retry. O GraphQL do GitHub retorna 502 esporadicamente, derrubando o step `Calcular fila de merge` no workflow `auto-update-pr-branch.yml`.

**Fix aplicado:** Adicionadas funções `erroTransitorio()` e `execComRetry()` com 4 tentativas e backoff [5s, 10s, 20s]. Todos os `execFileSync` em `decisaoAtual()` substituídos por `execComRetry()`.

### 3. Flake HTTP 502 em `scripts/ci/actions-kpi.mjs`

**Causa raiz:** `fetch()` em `pedir()` sem retry. Se a API do GitHub devolver 502/503/504, o step `Publicar KPI de Actions` no `branch-hygiene-audit.yml` falha imediatamente.

**Fix aplicado:** Adicionado loop de retry com 4 tentativas e backoff [5s, 10s, 20s] para status 502/503/504.

### 4. `db-live-guard` — 7 jobs falham (depende do types-sync)

**Causa raiz:** artefatos do repo (`supabase/schema-catalog.json`, `src/integrations/supabase/types.ts`, `supabase/schema-manifest.json`) divergem do banco de produção porque o `types-sync` não conseguiu mergear (bloqueado pela causa raiz #1).

**Fix:** será resolvido automaticamente quando este PR mergear e o `types-sync` rodar e mergear com sucesso. O `db-live-guard` seguinte (diário às 06:13 UTC ou dispatch manual) deverá passar.

---

## Arquivos alterados neste PR

| Arquivo | Tipo de mudança |
|---|---|
| `src/integrations/supabase/types.ts` | +9 assinaturas RPC (aditivo) |
| `scripts/ci/fila-merge.mjs` | +retry HTTP 502 em `execFileSync` |
| `scripts/ci/actions-kpi.mjs` | +retry HTTP 502/503/504 em `fetch()` |

---

## Estado esperado após merge

| Workflow | Estado esperado |
|---|---|
| CI (ci.yml) | ✅ Verde — TypeCheck passa com `novas=0` |
| types-sync | ✅ Verde — ratchet `novas=0`, PR de sincronização abre e mergeia |
| db-live-guard | ✅ Verde — artefatos sincronizados após types-sync |
| branch-hygiene-audit | ✅ Verde — retry elimina flake 502 |
| auto-update-pr-branch | ✅ Verde — retry elimina flake 502 em fila-merge |

---

*Gerado em 2026-10-26. Ver também `PENDENCIAS.md` para itens que dependem de ação do Joaquim.*
