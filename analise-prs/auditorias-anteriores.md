# Reconciliação de Auditorias Anteriores
**Data:** 2026-10-31  
**Autor:** Copilot Project Coordinator (sessão Github_Copilotauditorias-anteriores-reconciliacao)  
**Escopo:** Todos os documentos de auditoria, handoff, plano e relatório encontrados no repositório local, quarentena e branches — comparados ao estado atual do código e do banco.

---

## Documentos Examinados

| # | Documento | Data | Agente | SHA/Ref | Escopo |
|---|---|---|---|---|---|
| D01 | RESGATE-ANALISE-261031.md | 2026-10-31 | Copilot Coding Agent | HEAD dia/2026-10-23 = 3024ca92c7 | Branches locais, quarentena, repos secundários |
| D02 | TRIAGEM-PRS-GITHUB-261031.md | 2026-10-31 | Copilot Coding Agent | GitHub main em 31/10 | 99 PRs abertas no GitHub |
| D03 | AUDIT-A-PROCESSAR-261031.md | 2026-10-31 | Copilot Coding Agent | claude/feat-c098-restore-tests-261027-1433 | Clone _a-processar/ZAPP_WEB_V2_LOCAL |
| D04 | docs/reconciliation/FINAL_RECONCILIATION_REPORT_2026-10-03.md | 2026-10-03 | Claude | 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6 (adendo: 4e73c776) | Auditoria exaustiva: 5.166 registros, 104 achados |
| D05 | docs/reconciliation/FINDINGS.md | 2026-10-03 | Claude | 2e7cf81c | 104 achados catalogados com evidência |
| D06 | docs/reconciliation/RECONCILIATION_STATUS.md | 2026-10-03 | Claude | 2e7cf81c | Status final da auditoria de reconciliação |
| D07 | HANDOFF_MISSION_10-10.md | 2026-06-12 | Claude/Cline | self-hosted (desativado) | Score 10/10: bugs, DB, arquitetura |
| D08 | docs/audits/onda3-260930/VEREDICTO-CONSOLIDADO.md | 2026-09-30 | Claude adversarial (1+5 agentes) | d3ed11cb | Segurança: #1265, #1266, #1267 + Onda 2 front |
| D09 | docs/audits/CONSOLIDACAO_BABBAGE_2117_2118_2026-10-21.md | 2026-10-21 | Claude | d7af7a671c | PRs #2117 e #2118 (docs de provenance + salvage) |
| D10 | docs/handoffs/HANDOFF_ARQUITETURA_AGENTES_2026-10-11.md | 2026-10-11 | Claude | — | Arquitetura Hermes, 122+ cartões V3→V2 |
| D11 | docs/plans/PLANO_95_POR_CENTO_2026-10-08.md | 2026-10-08 | Claude | — | Processo: taxa de aceite de agentes |
| D12 | docs/audits/PLANO_AUDITORIA_500_COMMITS_200_ETAPAS_2026-10-18.md | 2026-10-18 | Claude | ed4f57d7 | 499 commits (01–17/out), 279 achados |
| D13 | docs/ci/DECISOES_PENDENTES_2026-10-15.md | 2026-10-15 | Claude | — | CI/CD: decisões W20/W64/W67/W74/W79/W84/W89/W90 |
| D14 | RELATORIO_CI.md | 2026-10-21 | Claude | PR #2182 | 5 categorias CI; 4 corrigidas, 7 pendentes |
| D15 | PENDENCIAS.md | ver arquivo | Claude | PR #2182 | Pendências de CI pós-sessão |
| D16 | docs/handoffs/HANDOFF_ZAPP_WEB_V2_2026-08-29.md | 2026-08-29 | Claude | — | Handoff pós-migração agosto 2026 |
| D17 | docs/audits/adversarial-f1-f2-f3-*/ (múltiplos) | 2026-09-29/30 | Claude adversarial | — | Auditorias adversariais: DBA, mutação, brownfield, CI, red team |
| D18 | docs/reconciliation/SESSION_HANDOFF.md | 2026-10-03 | Claude | — | Handoff da sessão de reconciliação de outubro |

---

## Fontes Inacessíveis / Parcialmente Lidas

| Fonte | Motivo |
|---|---|
| docs/reconciliation/FINDINGS.md completo (104 achados) | Arquivo lido apenas parcialmente (OTH-001 a OTH-007); restante (OTH-008 a OTH-104) não capturado integralmente por limite de leitura |
| TRIAGEM-PRS-GITHUB-261031.md seções 3–5 | Arquivo truncado no preview; seção 1–2 lida |
| ~/arquitetura-v2/ (scripts da fábrica) | Diretório referenciado mas não varrido; lido apenas via handoffs |
| _arquivo/fabrica-hermes/ | Movido em 29/10 para ~/_arquivo/; não lido — auditoras, evidências, handoffs do OmniRoute |
| quarentena-zapp-2026-10-24/clone-55GB-A-PROCESSAR/analise-prs/ | Existência confirmada via branch chore/analise-prs-261024-2325; conteúdo não lido |
| docs/reconciliation/MASTER_LEDGER.json + FINDINGS.json | Arquivos JSON não lidos (referenciados em D04/D05) |
| ESTADO.md (branch chore/analise-prs-261024-2325) | Arquivo na branch remota; não lido |

---

## Linha do Tempo das Auditorias

`
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
Out 08    — HANDOFF_MULTIPLIX: 61/100 done, 39 abertos
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
`

---

## Achados Reconciliados

> Status possíveis: **CONFIRMADO PENDENTE** | **CORRIGIDO VERIFICADO** | **PARCIALMENTE CORRIGIDO** | **REINTRODUZIDO** | **SUPERADO** | **NÃO VERIFICADO** | **DUPLICADO** | **CONTRADITÓRIO**

### Grupo 1 — Segurança de Banco (RLS / RPCs)

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| SEG-01 | D08 (30/09) | Policy fraca 	eam_message_reactions permitia reação cross-team | **CORRIGIDO VERIFICADO** | PR #1265 mergeada; eactions_insert removida do pg_policies; toggle DEFINER com validação de membro [D08 §2] |
| SEG-02 | D08 (30/09) | RPC get_team_messages_page com coluna ambígua + recursão 	cm_select_own | **CORRIGIDO VERIFICADO** | PR #1266; assinatura inalterada; corpo vivo sem WHERE conversation_id = p_conversation_id sem qualificador; sem auto-referência [D08 §2] |
| SEG-03 | D08 (30/09) | Guards Multiplix fail-open | **CORRIGIDO VERIFICADO** | PR #1267; migration 20260930300000_multiplix_guards_fail_closed aplicada; 476 [PASS] no CI [D08 §2] |
| SEG-04 | D08 (30/09) | Guards TalkX (enforce_talkx_campaign_mutability, enforce_talkx_recipient_snapshot_mutability) fail-open | **CONFIRMADO PENDENTE** | Declarado como ALTA prioridade em D08 §7 item 1; não localizado PR de correção |
| SEG-05 | D08 (30/09) | mark_team_conversation_read: SECURITY DEFINER sem checar vínculo — escreve recibos cross-team | **CONFIRMADO PENDENTE** | Reproduzido em Postgres descartável [D08 §3 A1 e §7 item 2]; nenhum PR identificado |
| SEG-06 | D08 (30/09) | 	cm_insert_member: membro comum pode inscrever terceiro | **CONFIRMADO PENDENTE** | Reproduzido [D08 §7 item 3]; nenhum PR identificado |
| SEG-07 | D08 (30/09) | Policy Members can insert own receipts: repo tem versão fraca (20260928430000), produção tem versão estrita | **CONFIRMADO PENDENTE** | Nenhum harness assere a versão estrita [D08 §7 item 4] |
| SEG-08 | D12 (18/10) | non tem INSERT/UPDATE/DELETE em 117 tabelas (violação de menor privilégio) | **CONFIRMADO PENDENTE** | Verificado: GET /branches/main/protection → 404; 1 policy USING (true) sem TO [D12 §1.2]; Z002 do plano Z-series não executada |
| SEG-09 | D12 (18/10) | enforceRateLimit quebrado: usa ctx ausente da assinatura em _shared/validation.ts:359-370 | **CONFIRMADO PENDENTE** | Verificado em D12; todo 429 vira 500 nas 32 edges; nenhum PR de correção localizado |
| SEG-10 | D12 (18/10) | E2E escreve em banco de produção (e2e/fixtures/supabase-env.ts:40-47 usa .env.production) | **PARCIALMENTE CORRIGIDO** | W74 (PR #1953) removeu SUPABASE_SERVICE_ROLE_KEY do e2e-logado.yml e aplicou migration 20261015200000_e2e_cleanup_security_definer; mas supabase-env.ts como fonte primária não confirmado resolvido [D13] |
| SEG-11 | D07 (Jun 2026) | Self-hosted Supabase (supabase-mcp.atomicabr.com.br) com 513 tabelas, RLS desatualizada | **SUPERADO** | Banco migrado para 	nnnlkbymytvtqngbbqh.supabase.co [D07 nota topo] |

### Grupo 2 — CI/CD e Workflows

| ID | Origem | Achado | Status Atual | Evidência |
|---|---|---|---|---|
| CI-01 | D12 (18/10) | main sem branch protection nem rulesets | **CONFIRMADO PENDENTE** | GET /branches/main/protection → 404 [D12 §1.2 fato 1]; nenhum PR aplicando proteção localizado |
| CI-02 | D12 (18/10) | Edge functions do lote 16/10 fora do ar (deployment-manifest.json stale) | **NÃO VERIFICADO** | Confirmado em 18/10 [D12]; não verificado estado atual (31/10) |
| CI-03 | D12 (18/10) | check-migration-drift.mjs exit 1: 51 exceções com sql-sha256 não previsto | **NÃO VERIFICADO** | Reportado em D12 como causa do DB Guard fail; PR #2182 [D14] corrigiu 4 categorias mas não especifica se este foi um deles |
| CI-04 | D14 (21/10) | 5 categorias de falha de CI (CI Scripts, DB Guard, Unit Tests, etc.) | **PARCIALMENTE CORRIGIDO** | PR #2182: 4 categorias corrigidas; 7 itens pendentes em PENDENCIAS.md [D14] |
| CI-05 | D13 (15/10) | W84: CodeQL não era required check | **PARCIALMENTE CORRIGIDO** | PR #1953 mergeada; falta passo pós-merge: adicionar CodeQL aos required checks + atualizar github-settings-baseline.json [D13] |
| CI-06 | D13 (15/10) | W89: Security Rating E no SonarCloud por falso positivo em JSON de evidência | **CONFIRMADO PENDENTE** | 2 cliques do Joaquim no SonarCloud para marcar false positive; agente sem acesso [D13] |
| CI-07 | D13 (15/10) | W90: 12+ GitHub Apps instalados gerando ruído em PRs | **CONFIRMADO PENDENTE** | Recomendação: ficar com Codex, SonarCloud e Vercel; ação é manual do Joaquim [D13] |
| CI-08 | D13 (15/10) | W67: projeto Vercel duplicado (zapp-web-v2-main além do oficial zapp_web_v2) | **CONFIRMADO PENDENTE** | Ação manual Joaquim no painel Vercel [D13] |
| CI-09 | D12 (18/10) | FATAL: role 
