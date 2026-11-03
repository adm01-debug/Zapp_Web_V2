# Reconciliação de Auditorias Anteriores
**Data:** 2026-10-31  
**Autor:** Copilot Project Coordinator (sessão `Github_Copilotauditorias-anteriores-reconciliacao`)  
**Escopo:** Todos os documentos de auditoria, handoff, plano e relatório encontrados no repositório local, quarentena e branches — comparados ao estado atual do código e do banco.

---

## Documentos Examinados

| # | Documento | Data | Agente | SHA/Ref | Escopo |
|---|---|---|---|---|---|
| D01 | `RESGATE-ANALISE-261031.md` | 2026-10-31 | Copilot Coding Agent | HEAD `dia/2026-10-23` = `3024ca92c7` | Branches locais, quarentena, repos secundários |
| D02 | `TRIAGEM-PRS-GITHUB-261031.md` | 2026-10-31 | Copilot Coding Agent | GitHub `main` em 31/10 | 99 PRs abertas no GitHub |
| D03 | `AUDIT-A-PROCESSAR-261031.md` | 2026-10-31 | Copilot Coding Agent | `claude/feat-c098-restore-tests-261027-1433` | Clone `_a-processar/ZAPP_WEB_V2_LOCAL` |
| D04 | `docs/reconciliation/FINAL_RECONCILIATION_REPORT_2026-10-03.md` | 2026-10-03 | Claude | `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6` (adendo: `4e73c776`) | Auditoria exaustiva: 5.166 registros, 104 achados |
| D05 | `docs/reconciliation/FINDINGS.md` | 2026-10-03 | Claude | `2e7cf81c` | 104 achados catalogados com evidência |
| D06 | `docs/reconciliation/RECONCILIATION_STATUS.md` | 2026-10-03 | Claude | `2e7cf81c` | Status final da auditoria de reconciliação |
| D07 | `HANDOFF_MISSION_10-10.md` | 2026-06-12 | Claude/Cline | self-hosted (desativado) | Score 10/10: bugs, DB, arquitetura |
| D08 | `docs/audits/onda3-260930/VEREDICTO-CONSOLIDADO.md` | 2026-09-30 | Claude adversarial (1+5 agentes) | `d3ed11cb` | Segurança: #1265, #1266, #1267 + Onda 2 front |
| D09 | `docs/audits/CONSOLIDACAO_BABBAGE_2117_2118_2026-10-21.md` | 2026-10-21 | Claude | `d7af7a671c` | PRs #2117 e #2118 (docs de provenance + salvage) |
| D10 | `docs/handoffs/HANDOFF_ARQUITETURA_AGENTES_2026-10-11.md` | 2026-10-11 | Claude | — | Arquitetura Hermes, 122+ cartões V3→V2 |
| D11 | `docs/plans/PLANO_95_POR_CENTO_2026-10-08.md` | 2026-10-08 | Claude | — | Processo: taxa de aceite de agentes |
| D12 | `docs/audits/PLANO_AUDITORIA_500_COMMITS_200_ETAPAS_2026-10-18.md` | 2026-10-18 | Claude | `fed4f57d7` | 499 commits (01–17/out), 279 achados |
| D13 | `docs/ci/DECISOES_PENDENTES_2026-10-15.md` | 2026-10-15 | Claude | — | CI/CD: decisões W20/W64/W67/W74/W79/W84/W89/W90 |
| D14 | `RELATORIO_CI.md` | 2026-10-21 | Claude | PR #2182 | 5 categorias CI; 4 corrigidas, 7 pendentes |
| D15 | `PENDENCIAS.md` | ver arquivo | Claude | PR #2182 | Pendências de CI pós-sessão |
| D16 | `docs/handoffs/HANDOFF_ZAPP_WEB_V2_2026-08-29.md` | 2026-08-29 | Claude | — | Handoff pós-migração agosto 2026 |
| D17 | `docs/audits/adversarial-f1-f2-f3-*/` (múltiplos) | 2026-09-29/30 | Claude adversarial | — | Auditorias adversariais: DBA, mutação, brownfield, CI, red team |
| D18 | `docs/reconciliation/SESSION_HANDOFF.md` | 2026-10-03 | Claude | — | Handoff da sessão de reconciliação de outubro |

---

## Fontes Inacessíveis / Parcialmente Lidas

| Fonte | Motivo |
|---|---|
| `docs/reconciliation/FINDINGS.md` completo (104 achados) | Arquivo lido parcialmente (OTH-001 a OTH-007); restante (OTH-008 a OTH-104) não capturado por limite de leitura |
| `TRIAGEM-PRS-GITHUB-261031.md` seções 3–5 | Arquivo truncado no preview; seção 1–2 lida |
| `~/arquitetura-v2/` (scripts da fábrica) | Diretório referenciado mas não varrido; lido apenas via handoffs |
| `_arquivo/fabrica-hermes/` | Movido em 29/10 para `~/_arquivo/`; não lido — auditoras, evidências, handoffs do OmniRoute |
| `quarentena-zapp-2026-10-24/clone-55GB-A-PROCESSAR/analise-prs/` | Existência confirmada via branch `chore/analise-prs-261024-2325`; conteúdo não lido |
| `docs/reconciliation/MASTER_LEDGER.json` + `FINDINGS.json` | Arquivos JSON não lidos (referenciados em D04/D05) |
| `ESTADO.md` (branch `chore/analise-prs-261024-2325`) | Arquivo na branch remota; não lido |

---

## Linha do Tempo das Auditorias

```
Abr 2026 — Sessões 1–5 (Claude/Cline): score 6.0 → 9.8 (infra, CI, RLS, docs)
Jun 2026 — Sessões 6–8 (Claude/Cline): score 9.8 → 10.0 (arquitetura, DB, 10 bugs) [D07]
Ago 2026 — Migração de banco (self-hosted → Supabase cloud tnnnlkbymytvtqngbbqh) [D16]
Set 16    — PLANO_CORRECOES_50_ETAPAS: auditoria local↔GitHub↔banco
Set 22    — TRIAGEM_CONTEUDO_LOCAL_DESTINO_GITHUB_BANCO
Set 25–27 — PLANO_GITHUB_ACTIONS_100_ETAPAS: 15 workflows auditados
Set 29–30 — Auditorias adversariais F1/F2/F3 + Onda 3 [D08]:
             - PRs #1265, #1266, #1267 auditadas e confirmadas
             - Fila de 11 follow-ups gerada
Out 01–04 — TalkX V4 planado (200 etapas X001–X200)
Out 03    — Reconciliação exaustiva [D04/D05/D06]:
             - Baseline 2e7cf81c: 5.166 registros, 104 achados
Out 05–09 — Era Devin/Cursor: 2.314 branches v2/t-*, v2/n-*, v2/tl-* criadas
Out 08    — HANDOFF_MULTIPLIX: 61/100 steps done, 39 abertos
Out 08    — PLANO_95_POR_CENTO: taxa de aceite 69%, meta 95% [D11]
Out 11    — HANDOFF_ARQUITETURA_AGENTES: 32 cartões V3→V2 ativos [D10]
Out 11–13 — Auditorias paridade V3→V2 (partes 1–5 de cada módulo)
Out 15    — DECISOES_PENDENTES CI: W74 feito, W84/W89/W90 aguardam Joaquim [D13]
Out 18    — PLANO_AUDITORIA_500_COMMITS: 279 achados em 499 commits [D12]
Out 21    — CONSOLIDACAO_BABBAGE #2117 e #2118 [D09]
Out 21    — RELATORIO_CI: PR #2182 — 4 categorias CI corrigidas [D14]
Out 23    — Integração diária: HEAD = dia/2026-10-23 = 3024ca92c7
Out 24    — Clone 55GB movido para quarentena
Out 28–31 — Era Codex: 41 worktrees, branches codex/consolida-*, codex/inventario-*
Out 31    — Este documento [D01, D02, D03]
```

---

## Achados Reconciliados

> Status possíveis: **CONFIRMADO PENDENTE** | **CORRIGIDO VERIFICADO** | **PARCIALMENTE CORRIGIDO** | **REINTRODUZIDO** | **SUPERADO** | **NÃO VERIFICADO** | **DUPLICADO** | **CONTRADITÓRIO**

### Grupo 1 — Segurança de Banco (RLS / RPCs)

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| SEG-01 | D08 (30/09) | Policy fraca `team_message_reactions` permitia reação cross-team | **CORRIGIDO VERIFICADO** | PR #1265 mergeada; policy `reactions_insert` removida; toggle DEFINER com validação de membro [D08 §2] |
| SEG-02 | D08 (30/09) | RPC `get_team_messages_page` com coluna ambígua + recursão `tcm_select_own` | **CORRIGIDO VERIFICADO** | PR #1266; assinatura inalterada; sem auto-referência [D08 §2] |
| SEG-03 | D08 (30/09) | Guards Multiplix fail-open | **CORRIGIDO VERIFICADO** | PR #1267; migration `20260930300000_multiplix_guards_fail_closed` aplicada; 476 `[PASS]` no CI [D08 §2] |
| SEG-04 | D08 (30/09) | Guards TalkX (`enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`) fail-open | **CONFIRMADO PENDENTE** | Declarado como ALTA prioridade em D08 §7 item 1; nenhum PR de correção localizado |
| SEG-05 | D08 (30/09) | `mark_team_conversation_read`: SECURITY DEFINER sem checar vínculo — escreve recibos cross-team | **CONFIRMADO PENDENTE** | Reproduzido em Postgres descartável [D08 §3 A1 e §7 item 2]; nenhum PR identificado |
| SEG-06 | D08 (30/09) | `tcm_insert_member`: membro comum pode inscrever terceiro | **CONFIRMADO PENDENTE** | Reproduzido [D08 §7 item 3]; nenhum PR identificado |
| SEG-07 | D08 (30/09) | Policy `Members can insert own receipts`: repo tem versão fraca, produção tem versão estrita | **CONFIRMADO PENDENTE** | Nenhum harness assere a versão estrita [D08 §7 item 4] |
| SEG-08 | D12 (18/10) | `anon` tem INSERT/UPDATE/DELETE em 117 tabelas (violação de menor privilégio) | **CONFIRMADO PENDENTE** | Verificado: 1 policy `USING (true)` sem `TO` [D12 §1.2]; Z002 do plano Z-series não executada |
| SEG-09 | D12 (18/10) | `enforceRateLimit` quebrado: usa `ctx` ausente da assinatura em `_shared/validation.ts:359-370` | **CONFIRMADO PENDENTE** | Todo 429 vira 500 nas 32 edges [D12]; nenhum PR de correção localizado |
| SEG-10 | D12 (18/10) | E2E escreve em banco de produção (`e2e/fixtures/supabase-env.ts:40-47` usa `.env.production`) | **PARCIALMENTE CORRIGIDO** | W74 (PR #1953) removeu `SUPABASE_SERVICE_ROLE_KEY` do `e2e-logado.yml` e aplicou migration; `supabase-env.ts` como fonte primária não confirmado resolvido [D13] |
| SEG-11 | D07 (Jun 2026) | Self-hosted Supabase (`supabase-mcp.atomicabr.com.br`) com 513 tabelas, RLS desatualizada | **SUPERADO** | Banco migrado para `tnnnlkbymytvtqngbbqh.supabase.co` [D07 nota topo] |

### Grupo 2 — CI/CD e Workflows

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| CI-01 | D12 (18/10) | `main` sem branch protection nem rulesets | **CONFIRMADO PENDENTE** | `GET /branches/main/protection` → 404 [D12 §1.2 fato 1]; nenhum PR aplicando proteção localizado |
| CI-02 | D12 (18/10) | Edge functions do lote 16/10 fora do ar (`deployment-manifest.json` stale) | **NÃO VERIFICADO** | Confirmado em 18/10 [D12]; estado atual (31/10) não re-verificado |
| CI-03 | D12 (18/10) | `check-migration-drift.mjs` exit 1: 51 exceções com `sql-sha256` não previsto | **NÃO VERIFICADO** | Causa do DB Guard fail [D12]; PR #2182 [D14] corrigiu 4 categorias mas não especifica este |
| CI-04 | D14 (21/10) | 5 categorias de falha de CI (CI Scripts, DB Guard, Unit Tests, etc.) | **PARCIALMENTE CORRIGIDO** | PR #2182: 4 categorias corrigidas; 7 itens pendentes em `PENDENCIAS.md` [D14] |
| CI-05 | D13 (15/10) | W84: CodeQL não era required check | **PARCIALMENTE CORRIGIDO** | PR #1953 mergeada; falta passo pós-merge: adicionar CodeQL aos required checks + atualizar `github-settings-baseline.json` [D13] |
| CI-06 | D13 (15/10) | W89: Security Rating E no SonarCloud por falso positivo em JSON de evidência | **CONFIRMADO PENDENTE** | 2 cliques do Joaquim no SonarCloud para marcar false positive; agente sem acesso [D13] |
| CI-07 | D13 (15/10) | W90: 12+ GitHub Apps instalados gerando ruído em PRs | **CONFIRMADO PENDENTE** | Recomendação: ficar com Codex, SonarCloud e Vercel; ação é manual do Joaquim [D13] |
| CI-08 | D13 (15/10) | W67: projeto Vercel duplicado (`zapp-web-v2-main` além do oficial `zapp_web_v2`) | **CONFIRMADO PENDENTE** | Ação manual Joaquim no painel Vercel [D13] |
| CI-09 | D12 (18/10) | `FATAL: role "root" does not exist` poluindo log do DB Guard | **NÃO VERIFICADO** | `--health-cmd pg_isready` sem `-U postgres` [D12 §1.3] |

### Grupo 3 — Frontend e Funcionalidades

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| FE-01 | D05 (03/10) | OTH-001: Encaminhar N omite arquivos selecionados fora do filtro (P1) | **NÃO VERIFICADO** | Confirmado estaticamente em D05; sem PR de correção localizado |
| FE-02 | D05 (03/10) | OTH-002: Contagens de Arquivos permanecem em cache após exclusão (P2) | **NÃO VERIFICADO** | PR #1865 introduziu o bug; sem PR de correção localizado |
| FE-03 | D05 (03/10) | OTH-003: Sincronização Gmail parcial gera toast de sucesso (P1) | **NÃO VERIFICADO** | HTTP 207 + success:false não tratado [D05]; sem PR de correção |
| FE-04 | D05 (03/10) | OTH-004: Exportação Catálogo omite produtos com nomes empatados (P1) | **NÃO VERIFICADO** | Paginação por offset sem desempate [D05]; sem PR de correção |
| FE-05 | D05 (03/10) | OTH-005: Email filtra/pagina em memória — limite efetivo 50k linhas (P2) | **NÃO VERIFICADO** | Contrato EN-025 exigia cursor; não cumprido [D05] |
| FE-06 | D12 (18/10) | Cliente Supabase rebaixado a `any` e 64 casts `any` em payload UPDATE | **NÃO VERIFICADO** | Reportado em D12 R9 (FE-04, FE-06); sem PR de correção |
| FE-07 | D12 (18/10) | `TONE_OPTIONS.find()` com non-null assertion derruba painel de IA (FE-11) | **NÃO VERIFICADO** | Non-null assertion [D12 R9] |
| FE-08 | D09 (21/10) | E90: `notificationclick` → param `?cid=` ausente em toda `src/` | **CONFIRMADO PENDENTE** | 0 ocorrências em `src/`; exige mudança em `useTeamChatNotifications.ts` via PR #2080 [D09] |
| FE-09 | D09 (21/10) | E61 `useResolvedStorageUrl` e E76 `useAgentPresenceMap` pendentes de portagem | **CORRIGIDO VERIFICADO** | Ambos OK na main: 56 e 18 arquivos em `src/` respectivamente [D09 §2] |
| FE-10 | D09 (21/10) | E83: Entrar via código de departamento | **CORRIGIDO VERIFICADO** | PR #2131 com `useRedeemDepartmentInvite` + `EnterDepartmentByCode.tsx` [D09 §2] |
| FE-11 | D07 (Jun 2026) | 10 bugs críticos (BUG-1 a BUG-10): ErrorBoundary, vite.config, useAuth, ProtectedRoute | **CORRIGIDO VERIFICADO** | Todos corrigidos em junho 2026 [D07] — não re-verificados no HEAD atual |
| FE-12 | D10 (11/10) | `scheduled_messages`: nenhuma edge/função/job envia mensagens; tabela vazia no banco vivo | **CONFIRMADO PENDENTE** | Cartão AG2 cria o enviador [D10 §6b]; nenhum PR entregue localizado |

### Grupo 4 — Banco de Dados / Migrations

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| DB-01 | D07 (Jun 2026) | 16 índices redundantes removidos, 6 criados, realtime: 50→24 tabelas | **CORRIGIDO VERIFICADO** | Executado em junho 2026 [D07] |
| DB-02 | D12 (18/10) | 51 migrations com campo `sql-sha256` não previsto no `check-migration-drift.mjs` | **NÃO VERIFICADO** | DB-01/02/03 do plano 500 commits; status após PR #2182 não confirmado |
| DB-03 | D12 (18/10) | `enforceRateLimit` em `_shared/validation.ts`: usa `ctx` ausente (duplicado de SEG-09) | **CONFIRMADO PENDENTE** | Todo 429 → 500 nas 32 edges [D12] |
| DB-04 | D08 (30/09) | `transfer_team_conversation_department`: SECURITY DEFINER sem verificar vínculo | **NÃO VERIFICADO** | Pendente revisão [D08 §7 item 5] |
| DB-05 | D12 (18/10) | Migration `20261015200000_e2e_cleanup_security_definer` não aplicada em produção | **CORRIGIDO VERIFICADO** | Aplicada em sessão de 15/10 [D13]: função existe em `pg_proc`, ledger tem version, ACL correta |

### Grupo 5 — Processo e Qualidade de Agentes

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| QA-01 | D11 (08/10) | Taxa de aceite de primeira: 69% (meta 95%); workeria: 31%, worker: 46% | **NÃO VERIFICADO** | Medido em 08/10 [D11]; estado atual desconhecido |
| QA-02 | D11 (08/10) | 38% das recusas por "relato afirma o que o diff não mostra" | **NÃO VERIFICADO** | Plano de correção [D11 §3] criado; execução não verificada |
| QA-03 | D12 (18/10) | 30% dos 499 commits são `fix`; 77% deles consertam arquivo da 48h anterior | **NÃO VERIFICADO** | Padrão de retrabalho estrutural; sem causa-raiz única corrigida |
| QA-04 | D12 (18/10) | 20 `waitForTimeout` nos specs E2E + `auth.setup.ts` com retry por sleep (flakiness 2x) | **CONFIRMADO PENDENTE** | QA-18, QA-24 [D12]; etapa Z138 do plano não executada |

### Grupo 6 — Repositório / Branches / Infraestrutura

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| INF-01 | D01 (31/10) | 4.110 branches locais sem remote tracking — risco de perda se disco WSL falhar | **CONFIRMADO PENDENTE** | Verificado hoje [D01 §3]; nenhum bundle/push executado |
| INF-02 | D01 (31/10) | 2.314 branches exclusivas da quarentena (Out 5–10): trabalho Devin/Cursor | **NÃO VERIFICADO** | Pode já ter sido integrado via lote/integra; não confirmado [D01 §4] |
| INF-03 | D03 (31/10) | 2 arquivos WIP não commitados em `_a-processar`: `ContactNotes.editarFixar.test.tsx` e `ContactNotes.ordemFoco.test.tsx` | **CONFIRMADO PENDENTE** | Verificado hoje [D03 §5]; ZERO commits exclusivos além destes WIPs |
| INF-04 | D01 (31/10) | Reset do Hermes cancelado em 31/10 10:49; backup de 4.0 GB em Windows | **CONFIRMADO PENDENTE** | App reaberto durante a carência de 120s [D01 §7] |
| INF-05 | D01 (31/10) | 11 branches à frente do origin (8 a 26 commits); todas muito atrás do main | **CONFIRMADO PENDENTE** | `codex/diagnostico-e2e-mapa-20261028`, `local/fase0-banco-local` etc. [D01 §5] |
| INF-06 | D10 (11/10) | Chave do provedor Hermes expira em 10/11/2026 | **NÃO VERIFICADO** | Reportado em D10 §8; verificar se já expirou (hoje é 31/10) |

---

## Contradições Entre Documentos

| # | Documentos | Contradição | Resolução |
|---|---|---|---|
| C01 | D07 vs D12 | D07 (jun 2026) cita 513 tabelas no banco; D12 (out 2026) usa banco diferente (`tnnnlkbymytvtqngbbqh`) | Instâncias distintas: D07 é referência histórica desatualizada. **D12 prevalece.** |
| C02 | D08 vs D09 | D08 (set 2026) lista E61/E76 como pendentes de portagem; D09 (out 2026) confirma ambas como OK_NA_MAIN | D09 é mais recente e verificado por comando. **D09 prevalece.** |
| C03 | D11 vs D12 | D11 mede taxa de aceite 73% em 24h; D12 registra 77% dos fix-commits refazendo arquivo das 48h anteriores | Métricas diferentes (qualidade de agente vs retrabalho de código). **Não contraditórias** — sugerem que o retrabalho continuou além da melhoria de processo. |
| C04 | D12 §1.2 original vs revisão R1 | Versão original: `anon` "pode apagar tabelas" via TRUNCATE. Revisão de 18/10 (R1): PostgREST não emite TRUNCATE; vetor é estreito | **Versão R1 prevalece** — ler somente a seção "Revisão de 2026-10-18" do D12. |

---

## PRs Relacionadas a Achados

| PR | Escopo | Estado | Achado |
|---|---|---|---|
| #1265 | Policy fraca `team_message_reactions` | Mergeada | SEG-01 |
| #1266 | RPC ambígua + recursão tcm | Mergeada | SEG-02 |
| #1267 | Guards Multiplix fail-closed | Mergeada | SEG-03 |
| #1290, #1294, #1297 | Fixes de front (Onda 2) | Mergeadas (`160f3405`) | FE geral |
| #1314 | Integração Onda 3 + fixes | Mergeada | SEG-01/02/03 |
| #1865 | media-gallery-counts | Mergeada | FE-02 (introduziu bug) |
| #1953 | W74: remove `SUPABASE_SERVICE_ROLE_KEY` + CodeQL | Mergeada | SEG-10, CI-05 |
| #1979 | CI: bun.lock inconsistente | Mergeada | CI-04 parcial |
| #2080 | `useTeamChatNotifications` + param `?cid=` | Estado desconhecido | FE-08 |
| #2117 | Docs: provenance migrations team_chat | OPEN / MERGEABLE / CI bloqueado | D09 |
| #2118 | Docs: MATRIZ_BABBAGE_SALVAGE | OPEN / MERGEABLE / CI bloqueado | D09 |
| #2131 | Entrar via código de departamento | Mergeada | FE-10 |
| #2182 | CI: correções de 4 categorias | Mergeada | CI-04 |

---

## Trabalho Anterior Recuperado / Verificado

1. **Banco oficial confirmado:** `tnnnlkbymytvtqngbbqh.supabase.co` (Supabase cloud). Self-hosted desativado desde ago 2026. HANDOFF_MISSION_10-10 é referência histórica apenas.
2. **Paridade V3→V2 encerrada:** V3 aposentada com 0 commits exclusivos vs V2/main. 40 migrations `team_chat` estão na main como cópias do ledger (PR #1199) — não portá-las novamente.
3. **`_a-processar` pode ser removido** após commitar os 2 WIPs de teste; o `resolve-rollback-ref.mjs` já está no principal (commit `890bec989d6`).
4. **Branch `chore/analise-prs-261024-2325`** contém pasta `analise-prs/` e arquivo `ESTADO.md` não lidos — possível inventário anterior de PRs.
5. **Multiplix:** 61/100 steps entregues em out 2026; 39 nunca implementados segundo handoff de out 8.
6. **TalkX V4:** 200 etapas (X001–X200) planejadas; X028 integrado como único ponto confirmado (adendo 03/10); restante desconhecido.

---

## Recomendações Fora do Escopo (Backlog)

> Em ordem de impacto. Cada item é executável por agente via MCP.

| # | Item | Impacto no negócio | Esforço |
|---|---|---|---|
| B01 | Corrigir SEG-04/SEG-05/SEG-06: guards TalkX fail-open, `mark_team_conversation_read` cross-team, `tcm_insert_member` | CRÍTICO — furos de segurança confirmados com PoC de exploit | Médio: 3 migrations + harnesses |
| B02 | Aplicar proteção de branch na `main` (CI-01): ao menos `required checks` para CI verde | ALTO — todo merge é sem portão hoje | Baixo: 1 PR + 1 clique Joaquim |
| B03 | Corrigir `enforceRateLimit` em `_shared/validation.ts:359-370` (SEG-09) | ALTO — todo 429 → 500 nas 32 edges; limitador de abuso desligado | Baixo: 1 linha de código |
| B04 | Criar enviador de `scheduled_messages` (FE-12): cartão AG2 do plano paridade | ALTO — mensagens agendadas nunca disparam em produção | Médio: 1 edge + 1 job pg_cron |
| B05 | Push das 4.110 branches sem tracking (INF-01) + bundle de backup | ALTO — risco de perda permanente se disco WSL falhar | Baixo: script de push em lote |
| B06 | Commitar 2 WIPs em `_a-processar` e fazer push (INF-03) | MÉDIO — 2 arquivos de teste perdem-se com a pasta | Baixo: `git add + commit + push` |
| B07 | Verificar e renovar chave do provedor Hermes (INF-06: expira 10/11 ou já expirou) | MÉDIO — Hermes para de funcionar sem aviso | Baixo: verificar no painel |
| B08 | Corrigir OTH-001 (Encaminhar omite arquivos) e OTH-003 (Gmail toast falso de sucesso) | MÉDIO — bugs P1 em fluxos críticos de usuário | Médio: 2 PRs |
| B09 | Ações manuais do Joaquim: W89 (2 cliques SonarCloud false positive), W90 (remover 12 bots), W67 (Vercel duplicado) | MÉDIO — Security Rating E e ruído em PRs | Baixo: 10–15 min manual |
| B10 | Ler `chore/analise-prs-261024-2325:analise-prs/` e `ESTADO.md` para recuperar inventário anterior | BAIXO — pode conter triagem de PRs já feita | Baixo: `git show` |

---

*Documento gerado em 2026-10-31 por Copilot Project Coordinator.  
Nenhuma branch foi deletada, mergeada ou modificada durante a produção deste relatório.  
Fontes lidas: 18 documentos primários + 250+ arquivos catalogados por find.*
