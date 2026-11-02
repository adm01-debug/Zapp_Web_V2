# FASE3 — Estado Atual de Branches
**Inventário: adm01-debug/Zapp_Web_V2 | Gerado em: 30/10/2026**

Referência anterior: `inventario/FASE2_ANALISE_TOP30.md` (gerado em 23/10/2026)

---

## 0. Resumo executivo

| Métrica | Valor |
|---|---|
| Total de branches abertas (incl. main) | **223** |
| Branches abertas (excl. main) | **222** |
| Branches da FASE2 confirmadas abertas | **29 de 30 mapeadas** |
| Branches mergeadas/deletadas desde 23/10 | **3** |
| Novas branches surgidas desde 23/10 | **~80** |
| Coleta | 3 páginas × 100 via GitHub API (30/10/2026) |

---

## 1. Status das branches mapeadas na FASE2

### 1.1 Branches MERGEADAS ou DELETADAS desde 23/10

| Branch | Status | Observação |
|---|---|---|
| `claude/sharp-maxwell-6tr6ee` | ✅ **MERGEADA** | PR #2204 — inventário FASE2, 29/10 |
| `claude/fix-schema-manifest-sanitize-261023-1450` | ✅ **MERGEADA** | PR #2205 — fix sanitize + schema manifest, 29/10 |
| `claude/sharp-faraday-qfortu` | 🗑 **DELETADA** | Não encontrada nas 223 branches (era candidata a investigar) |

### 1.2 Branches da FASE2 ainda abertas

**Cluster Copiloto RADAR — todas 20 sequenciais abertas:**

| Branch | Estado |
|---|---|
| `claude/feat-copiloto-cv001-010-radar-inicial-261013-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv011-020-intencao-261013-1830` | 🔴 ABERTA |
| `claude/feat-copiloto-cv021-030-historico-261014-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv031-040-contexto-261014-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv041-050-recomendacoes-261015-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv051-060-radar-ui-261015-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv061-070-ghost-text-261016-1000` | 🔴 ABERTA |
| `claude/feat-copiloto-cv071-080-feedback-261016-1000` | 🔴 ABERTA |
| `claude/feat-copiloto-cv081-090-refinamentos-261017-1000` | 🔴 ABERTA |
| `claude/feat-copiloto-cv091-100-integracao-261017-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv101-110-polish-261018-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv111-120-edge-functions-261018-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv121-130-edge-qa-261019-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv131-140-e2e-261019-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv141-150-ganho-261020-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv151-160-deploy-261020-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv161-170-talkx-261021-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv171-180-261022-0900` | 🔴 ABERTA |
| `claude/feat-copiloto-cv181-190-261022-1500` | 🔴 ABERTA |
| `claude/feat-copiloto-cv191-200-261023-0900` | 🔴 ABERTA |

**Variantes (FASE2 recomendava descartar):**

| Branch | Estado |
|---|---|
| `claude/feat-copiloto-cv061-070-ghost-text-261016-2142` | 🔴 ABERTA (descartar — idêntica à 1000) |
| `claude/feat-copiloto-cv141-150-ganho-261020-1426` | 🔴 ABERTA (descartar — inferior à 0900) |
| `claude/feat-copiloto-cv161-170-talkx-261021-2200` | 🔴 ABERTA (descartar — inferior à 0900) |

**Fixes/features isoladas:**

| Branch | Estado |
|---|---|
| `claude/fix-ci-main-verde-261023-1540` | 🔴 ABERTA |
| `claude/fix-canonical-receipt-policies-261020-2005` | 🔴 ABERTA |
| `claude/fix-ga-fase0-banco-e2e-261020-2200` | 🔴 ABERTA |
| `claude/feat-e83-entrar-por-codigo-261020-1935` | 🔴 ABERTA |
| `fix/ci-verde-261021` | 🔴 ABERTA |
| `codex/publish-followup-20261021` | 🔴 ABERTA |
| `claude/ecstatic-bardeen-twiveb` | 🔴 ABERTA |
| `claude/loving-lovelace-esc3l2` | 🔴 ABERTA |
| `claude/pensive-cori-i93zgf` | 🔴 ABERTA |
| `claude/ga-ci-verde-261020` | 🔴 ABERTA |
| `codex/fix-failed-workflows-20261020` | 🔴 ABERTA |
| `fix/ci-workflows-vermelhos` | 🔴 ABERTA |
| `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206` | 🔴 ABERTA |

---

## 2. Novas branches desde 23/10 (~80 branches)

### 2.1 Cluster Copiloto — fases seguintes (5 branches, 24/10)

Cinco branches tentando avançar as fases 8-15 do Copiloto em paralelo às cv* sequenciais.
⚠ Três são variantes de edge functions para as mesmas fases — sessões concorrentes.

| Branch | Conteúdo |
|---|---|
| `claude/feat-copiloto-fases13-15-ddl-261024-1530` | DDL schemas das fases 13-15 |
| `claude/feat-copiloto-edges-fases8-10-261024-1545` | Edge functions fases 8-10 (v1) |
| `claude/feat-copiloto-edge-fns-fases8-15-261024-1615` | Edge functions fases 8-15 (v2) |
| `claude/feat-copiloto-cv071-150-fases-8-15-261024-1400` | UI mega-branch cv071-150 |
| `claude/feat-copiloto-edge-fases8-10-261024-1700` | Edge functions fases 8-10 (v3) |

Verificar qual das três variantes de edge (1545, 1615, 1700) tem CI verde antes de mergear.

### 2.2 Cluster CI verde 25/10 (9 branches novas + 1 da FASE2)

Dez tentativas acumuladas de consertar CI, todas abertas:

| Branch | Hora | Status |
|---|---|---|
| `claude/fix-ci-main-verde-261023-1540` | 23/10 15:40 | 🔴 ABERTA (FASE2) |
| `claude/fix-ci-main-verde-261025-1130` | 25/10 11:30 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1245` | 25/10 12:45 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1400` | 25/10 14:00 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1515` | 25/10 15:15 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1630` | 25/10 16:30 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1730` | 25/10 17:30 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-1830` | 25/10 18:30 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-2010` | 25/10 20:10 | 🔴 ABERTA |
| `claude/fix-ci-main-verde-261025-2130` | 25/10 21:30 | 🔴 ABERTA |

Candidato preferencial: `261025-2130` (última). As 8 intermediárias são candidatas ao descarte.

### 2.3 Cluster fix/f1a-lote-b-* (~25 branches)

Grande batch de fixes unitários (campanha F1A — Fase 1A):

**Lotes numerados:** `batch1` a `batch14` (sem batch11) = 13 branches

**Fixes nomeados** (12 branches):
- `fix/f1a-lote-b-connectioncard-dialog`
- `fix/f1a-lote-b-gamificacao-sem-escrita`
- `fix/f1a-lote-b-hooks-misc-1`
- `fix/f1a-lote-b-main`
- `fix/f1a-lote-b-realtime-channel-mock`
- `fix/f1a-lote-b-talkxsegments`
- `fix/f1a-lote-b-talkxsuppression-hook-morto`
- `fix/f1a-lote-b-useadmindata-createuser-avatar`
- `fix/f1a-lote-b-useadmindata-select`
- `fix/f1a-lote-b-useknowledgebase`
- `fix/f1a-lote-b-useteamchatnotifications`
- `fix/f1a-lote-b-usewarroomalerts`

**Relacionados F1A (datas 18/10):**
- `fix/f1a-framer-motion-mock-voicechangerpicker-20261018`
- `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018`
- `fix/f1a-order-mock-usecustomemojis-20261018`
- `fix/f1a-supabase-channel-mock-audiomeme-20261018`

### 2.4 Cluster multi-modelo (11 branches)

Paradigma novo: sessões com prefixos de modelo específico:

| Prefixo | Branches | Interpretação |
|---|---|---|
| `claude_04/` | `clever-ramanujan-xllbpo`, `nice-cori-7snz6b`, `trusting-newton-duiglt` | Opus 4 / Claude 4 |
| `claude_05/` | `brave-mccarthy-zvzky4`, `festive-carson-ub43wu`, `upbeat-faraday-9e99s8`, `zen-feynman-29b7ix` | Claude 5 |
| `claude_juca/` | `practical-rubin-8xnw0u` | Sessão do Joaquim |
| `claude_pink/` | `cool-dijkstra-xk9ek2`, `dreamy-wright-j0bser`, `nice-hypatia-iikl82` | Variante específica |

### 2.5 Cluster adm01-debug-patch-* (14 branches)

Patches manuais, provavelmente via interface GitHub (Joaquim):
- `adm01-debug-patch-1-2` + sub-patches `-1-2-1` a `-1-2-12` (13 total)
- `adm01-debug-patch-2`, `patch-3`, `patch-4`

### 2.6 codex/consolida-* (4 branches, 29/10)

Consolidações recentes:
- `codex/consolida-contatos-fab`
- `codex/consolida-e2e-mapa-bootstrap`
- `codex/consolida-statuschips-contagens`
- `codex/consolida-team-unread-cache`

### 2.7 Fixes e features isolados (Out 24-30)

| Branch | Data | Relevância |
|---|---|---|
| `claude/fix-deploy-functions-261030-0215` | **30/10** | Deploy edge functions — hoje |
| `claude/fix-migrations-orphans-261030` | **30/10** | Orphan migrations — hoje |
| `claude/fix-contrato-db-offline-dashboard-kpi-guard-271026-0608` | 27/10 | Contrato DB offline |
| `claude/fix-e2e-workers-ci-timeout-271027-0924` | 27/10 | Timeout E2E workers |
| `claude/fix-stable-inventory-e09-261027-2359` | 27/10 | Inventário estável E09 |
| `claude/feat-e70-edge-contracts-job-281028-0305` | 28/10 | Edge contracts E70 |
| `claude/feat-e75-toolchain-env-281028-0600` | 28/10 | Toolchain E75 |
| `claude/feat-e71-skip-draft-prs-281026-0250` | 26/10 | Skip draft PRs E71 |
| `claude/fix-restore-settings-guard-281028-1830` | 28/10 | Settings guard restaurado |
| `claude/fix-types-sync-is-pinned-261029` | 29/10 | Types sync is-pinned |
| `codex/reconcile-live-migration-sources-20261029` | 29/10 | Reconciliação migrations |
| `feat/media-migration-tool-261024-2336` | 24/10 | Ferramenta migração de mídia |
| `fix/types-rpc-ausentes-261025` | 25/10 | RPCs ausentes no types.ts |
| `chore/remove-alien-workflows` | 25/10 | Limpeza de workflows |
| `claude/fix-fila-offline-sem-dono-261025-2110` | 25/10 | Fila offline sem dono |
| `claude/fix-paleta-filtros-celebracoes` | 25/10 | Paleta filtros celebrações |
| `claude/fix-revogar-grants-escrita-anon` | 25/10 | Revogar grants escrita anon |
| `claude/fix-settings-salvar-aparencia` | 25/10 | Settings salvar aparência |
| `claude/fix-talkx-cron-startup-timeout` | 25/10 | TalkX cron timeout startup |
| `claude/fix-talkx-hook-morto` | 25/10 | TalkX hook morto |
| `claude/fix-talkx-segmentos-estimativa` | 25/10 | TalkX segmentos estimativa |
| `claude/fix-templates-supervisor-knowledge` | 25/10 | Templates supervisor knowledge |
| `claude/fix-tc009-team-receipts-cid-261024-1730` | 24/10 | TC009 team receipts CID |
| `claude/fix-unit-tests-pre-existentes-261024-1700` | 24/10 | Unit tests pré-existentes |
| `claude/fix-unit-tests-src-261024-1630` | 24/10 | Unit tests src |
| `claude/fix-unit-tests-ui-divergent-round2-261024-1541` | 24/10 | Unit tests UI round2 |
| `claude/fix-db-guard-b0c-261024-1527` | 24/10 | DB guard B0C |
| `claude/fix-e2e-mock-app-bootstrap-261024-1527` | 24/10 | E2E mock bootstrap |
| `claude/feat-message-delivery-post-iniciado-261024-1719` | 24/10 | Entrega de mensagem pós-iniciado |
| `claude/feat-talkx-segmentos-filtros-261024-1753` | 24/10 | TalkX segmentos filtros |
| `chore/analise-prs-261024-2325` | 24/10 | Análise de PRs |

### 2.8 Outras novas

| Branch | Data | Notas |
|---|---|---|
| `dia/2026-10-23` | 23/10 | Branch do lote do dia |
| `f3/strict-false-baseline-20261018` | 18/10 | Baseline strict=false |
| `fix/ci-f1b-restaura-workflows-20261018` | 18/10 | F1B restauração workflows |
| `fix/ci-workflows` (sem data) | ~18/10 | Fix workflows genérico |
| `dependabot/*` (2 branches) | variadas | Dependabot automático |

---

## 3. Sumário quantitativo

| Categoria | Branches |
|---|---|
| Total (incl. main) | **223** |
| Copiloto cv* sequenciais | 20 |
| Copiloto cv* variantes/duplicatas | 3 |
| Copiloto novas fases (pós-FASE2) | 5 |
| fix-ci-main-verde tentativas | 10 |
| fix/f1a-lote-b-* | ~25 |
| fix/f1a-* isolados (18/10) | 4 |
| Multi-modelo (claude_04/05/pink/juca) | 11 |
| adm01-debug-patch-* | 14 |
| codex/consolida-* | 4 |
| Fixes/feats Out 24-30 (isolados) | ~31 |
| Outros (dia/, f3/, dependabot, etc.) | ~5 |
| Fixes/feats FASE2 ainda abertas | 13 |

---

## 4. Ordem de merge atualizada

A ordem de merge da FASE2 (21 itens) não foi executada. **0 de 21 mergeadas.**

### 4.1 Prioridade imediata — branches de HOJE (30/10)

1. `claude/fix-deploy-functions-261030-0215` — fix de deploy das edge functions
2. `claude/fix-migrations-orphans-261030` — orphan migrations (pode quebrar guard)

### 4.2 Prioridade alta — infraestrutura (Out 27-29)

3. `claude/fix-contrato-db-offline-dashboard-kpi-guard-271026-0608`
4. `claude/fix-e2e-workers-ci-timeout-271027-0924`
5. `claude/fix-types-sync-is-pinned-261029`
6. `codex/reconcile-live-migration-sources-20261029`
7. `claude/fix-restore-settings-guard-281028-1830`

### 4.3 Features novas (Out 26-28)

8. `claude/feat-e71-skip-draft-prs-281026-0250`
9. `claude/feat-e70-edge-contracts-job-281028-0305`
10. `claude/feat-e75-toolchain-env-281028-0600`

### 4.4 CI verde (melhor candidato)

11. `claude/fix-ci-main-verde-261025-2130` — descartar as 8 anteriores do mesmo dia

### 4.5 Copiloto — 20 sequenciais (ordem cv001→cv191-200)

Mesma ordem da FASE2. Verificar CI de cada antes de mergear.
Descartar variantes: cv061 (2142), cv141 (1426), cv161 (2200).
Depois das sequenciais, avaliar as 5 novas fases (seção 2.1).

### 4.6 Fixes/features da FASE2 restantes

12. `claude/feat-e83-entrar-por-codigo-261020-1935`
13. `claude/fix-canonical-receipt-policies-261020-2005`
14. `claude/fix-ga-fase0-banco-e2e-261020-2200`
15. `codex/publish-followup-20261021`
16. `fix/ci-verde-261021`
17. `claude/ga-ci-verde-261020`
18. `codex/fix-failed-workflows-20261020`
19. `fix/ci-workflows-vermelhos`
20. `claude/ecstatic-bardeen-twiveb`
21. `claude/loving-lovelace-esc3l2`
22. `claude/pensive-cori-i93zgf`
23. `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206`

---

## 5. Branches a descartar

| Branch | Motivo |
|---|---|
| `claude/feat-copiloto-cv061-070-ghost-text-261016-2142` | Duplicata da 1000 do mesmo dia |
| `claude/feat-copiloto-cv141-150-ganho-261020-1426` | Duplicata inferior à 0900 |
| `claude/feat-copiloto-cv161-170-talkx-261021-2200` | Duplicata inferior à 0900 |
| `claude/fix-ci-main-verde-261025-1130` até `261025-2010` (8) | Tentativas anteriores à 2130 |
| `claude/feat-copiloto-edges-fases8-10-261024-1545` | Verificar vs. 1615 e 1700; manter apenas 1 |
| `claude/feat-copiloto-edge-fns-fases8-15-261024-1615` | Verificar vs. 1545 e 1700; manter apenas 1 |

---

## 6. Clusters a investigar antes de mergear

| Cluster | Qtd. | Ação |
|---|---|---|
| `fix/f1a-lote-b-*` | ~25 | Verificar se há PRs abertas; são fixes unitários que talvez mergeem em lote |
| `adm01-debug-patch-*` | 14 | Patches manuais do Joaquim — verificar conteúdo antes de qualquer ação |
| Multi-modelo (`claude_04/`, `claude_05/`, `claude_pink/`, `claude_juca/`) | 11 | Novo paradigma; avaliar se têm PRs associadas |
| `codex/consolida-*` | 4 | Candidatos a merge rápido se CI verde |

---

*Gerado em 2026-10-30 via GitHub API. Inventário completo: 3 páginas × ~74-100 branches. Próximo inventário recomendado após executar a ordem de merge da seção 4.*
