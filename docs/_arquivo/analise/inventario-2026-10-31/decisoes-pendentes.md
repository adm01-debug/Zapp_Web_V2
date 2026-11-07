# Decisões pendentes — branches remotas sem PR (2026-10-31)

Gerado pela sessão S6 após varredura completa (clone não-raso, `git merge-tree`).
Cada linha aqui é uma decisão documentada; a condição de parada do S6 é satisfeita
quando TODAS as branches sem PR tiverem decisão explícita aqui ou PR aberta.

---

## 1. SUPERADA — conteúdo já na `main`; apagar

| Branch | Evidência |
|---|---|
| `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` | merge-tree = `main`^tree; branch apagada (422 "reference does not exist") |
| `fix/f1a-lote-b-batch3` | merge-tree = `main`^tree; apagada por S6 |
| `fix/f1a-lote-b-gamificacao-sem-escrita` | merge-tree = `main`^tree; apagada por S6 |
| `fix/f1a-order-mock-usecustomemojis-20261018` | merge-tree = `main`^tree; apagada por S6 |

Todas as 4 branches foram apagadas (evidência: DELETE 204 do GitHub API).

---

## 2. WORKFLOW-OBSOLETO — experimentos do editor web do GitHub

24 branches `adm01-debug-patch-*`:
`adm01-debug-patch-1` a `adm01-debug-patch-1-8` (8),
`adm01-debug-patch-2` a `adm01-debug-patch-2-12` (12),
`adm01-debug-patch-3`, `adm01-debug-patch-3-2` (2),
`adm01-debug-patch-4` (1)

Cada grupo tem 1 arquivo de workflow não presente na `main`:
- patch-1-*: `.github/workflows/dependency-review.yml`
- patch-2-*: `.github/workflows/deno.yml`
- patch-3-*: `.github/workflows/manual.yml`
- patch-4: `.github/workflows/main.yml`

Arquivos sem relevância para a estrutura atual de CI (que usa `ci.yml`, `db-guard.yml`, etc.).
São experimentos one-off do GitHub.com/edit que nunca foram destinados a PR.

**Decisão: ABANDONAR — S1 fecha como experimentos obsoletos.**  
Não abrir PRs; apagar as branches remotas quando confirmar que nenhuma PR está apontando para elas.

---

## 3. MIGRATION sem PR — sessões S3/S4/S5 abrem PR

Branches criadas hoje por sessões ativas:

| Branch | Sessão | Arquivos | Criada |
|---|---|---|---|
| `feat-codex-search-event-rpc-311031` | S3 | 1 migration (log_search_event RPC S3-020) | ~32 min após inventário |
| `feat-copiloto-fases13-15-ddl-v2-311031` | S5 | 1 migration (DDL 7 tabelas RADAR CV-121-150) | ~42 min após inventário |
| `feat-cv021-copilot-live-helpers-311031` | S5 | 1 migration (merge_brinde_state RPC CV-026) | ~33 min após inventário |
| `feat-cv031-brinde-intelligence-311031` | S5 | 1 migration (colunas Fase 4 CV-031/037-039) | ~33 min após inventário |

**Decisão: cada sessão abre PR para sua própria branch antes de encerrar o turno.**

---

## 4. INTEGRAR-LIMPO sem PR — S4 precisa abrir PR

| Branch | Arquivos | Sessão | Plano |
|---|---|---|---|
| `claude/festive-faraday-kv669k` | 22 arquivos, 18 commits, sem conflito | S4 | Item 1 do plano S4 |

---

## 5. S1/S2 — branches de workflow/CI sem PR

| Branch | Arquivos | Nota |
|---|---|---|
| `codex/publish-followup-20261021` | 59 arquivos, conflito alto | S2 item 7 — remover migrations conflitantes antes de PR |
| `codex/fix-failed-workflows-20261020` | 45 arquivos | S1/S2 — avaliar sobreposição com PRs abertas de CI |
| `fix/ci-verde-261021` | 46 arquivos | S1/S2 — avaliar sobreposição |
| `fix/ci-workflows-vermelhos` | 325 arquivos | S1 — mega-branch, provavelmente COBERTA por PRs menores abertas |
| `fix/ci-f1b-restaura-workflows-20261018` | 4 arquivos | S1 — verificar se coberta por PRs de CI |
| `fix/deploy-functions-deno-auto-2026-10-30` | 3 arquivos | S1 — deploy-functions fix |

---

## 6. S3 — branches de testes e tipos sem PR

| Branch | Arquivos | Nota |
|---|---|---|
| `codex/consolida-contatos-fab` | 13 arquivos | S3 — testes de contatos |
| `fix/types-rpc-ausentes-261025` | 5 arquivos | S3 — types RPC |
| `codex/sincronizacao-canonica-20261016` | 2 arquivos | S3/S5 — antiga, verificar se COBERTA |

---

## 7. fix/f1a-lote-b-* com 0 diffs — provável COBERTA, S3 verifica

Estas branches mostram `merge-tree diff` = 0 arquivos vs `main`, mas a árvore de merge
não é idêntica à `main`. Provavelmente COBERTA pelas PRs da família #2058–#2089 (S3 scope).

S3 deve verificar via `git merge-tree --write-tree origin/main origin/<b>` — se árvore == main^tree → apagar.

Branches (28 total):
`fix/f1a-framer-motion-mock-voicechangerpicker-20261018`,
`fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018`,
`fix/f1a-lote-b-admin-audit-page-size`, `fix/f1a-lote-b-audiomemes-storage-path`,
`fix/f1a-lote-b-authprovider`, `fix/f1a-lote-b-batch10`, `batch12`, `batch13`,
`batch2`, `batch4`, `batch5`, `batch6`, `batch7`, `batch8`, `batch9`,
`fix/f1a-lote-b-connectioncard-dialog`, `fix/f1a-lote-b-hooks-misc-1`,
`fix/f1a-lote-b-main`, `fix/f1a-lote-b-realtime-channel-mock`,
`fix/f1a-lote-b-talkxsegments`,
`fix/f1a-lote-b-talkxsuppression-hook-morto` (TEM 1 arquivo real — já tem PR #2071),
`fix/f1a-lote-b-useadmindata-createuser-avatar`, `fix/f1a-lote-b-useadmindata-select`,
`fix/f1a-lote-b-useknowledgebase`, `fix/f1a-lote-b-useteamchatnotifications`,
`fix/f1a-lote-b-usewarroomalerts`,
`fix/f1a-supabase-channel-mock-audiomeme-20261018` (TEM 1 arquivo real)

---

## 8. Branches do inventário com PRs abertas (já têm decisão)

Per `analise/inventario-2026-10-31/branches-remotas.md`: 142 PRs abertas cobrindo
a maioria das INTEGRAR-CONFLITO, MIGRATION e WORKFLOW. Essas têm decisão pela existência da PR.

---

## Resumo de ações pendentes por sessão

| Sessão | Ação | Branches |
|---|---|---|
| **S6** (esta) | ✅ FEITO — Apagadas 4 SUPERADA | cv061-070-ghost-text, f1a-batch3, f1a-gamificacao, f1a-order-mock |
| **S1** | Fechar adm01-debug-patch-* (24), avaliar ci/deploy | adm01-debug-patch-*, fix/ci-workflows-vermelhos, fix/ci-verde-261021, fix/ci-f1b-*, fix/deploy-functions-deno-auto |
| **S2** | Decidir publish-followup e ci branches | codex/publish-followup-20261021, codex/fix-failed-workflows-20261020 |
| **S3** | Abrir PR feat-codex-search-event-rpc-311031; verificar fix/f1a-lote-b-* | feat-codex-search-event-rpc-311031, fix/f1a-lote-b-* (28), codex/consolida-contatos-fab, fix/types-rpc-ausentes-261025 |
| **S4** | Abrir PR festive-faraday (item 1 do plano) | claude/festive-faraday-kv669k |
| **S5** | Abrir PRs para 3 migration branches criadas hoje | feat-copiloto-fases13-15-ddl-v2-311031, feat-cv021-copilot-live-helpers-311031, feat-cv031-brinde-intelligence-311031 |
