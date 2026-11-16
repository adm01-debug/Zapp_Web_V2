# Recuperação total do trabalho em branches — 16/11/2026

**Regra que este documento serve:** nenhuma branch e nenhuma PR é fechada sem prova byte a byte
de que o trabalho dela já está na `main` (ou em outra branch), ou de que ficou obsoleto. Trabalho
parcial de outro agente não é descartado: é terminado.

Enquanto o trabalho existia só dentro de uma branch, ele dependia de a branch não ser apagada.
Com este arquivo na `main`, cada arquivo não incorporado tem caminho e branch registrados — e
volta com um comando.

`main` no momento da medição: `714e2b659db2b19a539b1651d0b0c3be25a7ffc5`

Medição reproduzível por `scripts/recuperacao-branches/` (o README de lá tem a ordem, a variável
`OUT` e o recorte de cada bloco). A cadeia foi rodada duas vezes, a segunda depois de tornar os
scripts portáteis, e as duas saídas (`resumo.tsv`, `linhas.tsv`) saíram **idênticas**.

## O que foi medido

221 branches remotas — todas, exceto `main` e a gerada `contexto`.

Para cada branch, os arquivos que ela **introduz** em relação ao seu ponto de bifurcação
(`git diff --name-only --diff-filter=AMR $(git merge-base origin/main B) B`) passam por três
provas, em ordem:

1. **Mesmo caminho, mesmo byte** — `git rev-parse B:arquivo` igual a
   `git rev-parse origin/main:arquivo`. Trabalho incorporado.
2. **Mesmo byte em outro caminho** — o blob da branch aparece em `git ls-tree -r origin/main`.
   Pega arquivo movido ou renomeado, que a prova 1 não pega.
3. **Contenção por linha** — toda linha significativa (≥ 8 caracteres após trim) da versão da
   branch aparece na versão da `main`. Se sim, a `main` é superconjunto: o trabalho está lá, em
   arquivo que evoluiu depois.

| Resultado | Pares (arquivo, branch) |
|---|---|
| Mesmo caminho e mesmo byte, ou mesmo blob em outro caminho | 1.084 |
| Contido linha por linha | 209 |
| **NOVO** — não existe na `main` em caminho nenhum | 730 (558 caminhos distintos) |
| **PARCIAL** — a `main` tem o arquivo, falta alguma linha | 2.933 |

Os 1.084 + 209 são o ganho desta medição em relação a olhar nome de arquivo: trabalho que **já
está** incorporado, parte dele em caminho diferente do original.

## O recorte que importa

Dos 558 caminhos NOVO, a maioria é documento que os próprios agentes escreveram **sobre** o
trabalho (dossiê de análise, inventário, proposta de auditoria), não funcionalidade do sistema.
O que é código, banco ou automação:

| Bloco | Caminhos | O que é |
|---|---|---|
| A1 | 33 | migrations |
| A2 | 53 | `src/`, `e2e/`, edge, teste |
| A3 | 38 | scripts e workflows |
| B | 572 | documento de análise/auditoria |

### Bloco A1 — migrations que não existem na `main`

Este inventário é leitura: **não executou DDL nenhuma**. Aplicar qualquer uma destas segue o
fluxo de `docs/agentes/banco.md`.

| Arquivo (em `supabase/migrations/`) | Branch (`origin/…`) |
|---|---|
| `20261016193000_copilot_sessions.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016193100_copilot_insights.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016193200_copilot_feedback.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016193300_copilot_tick_trigger.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016193400_copilot_presence.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016193500_copilot_retention.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` |
| `20261016250000_e2e_fixture_message_rpc.sql` | `claude_pink/cool-dijkstra-xk9ek2` |
| `20261021000000_recreate_team_message_receipt_policies_canonical.sql` | `claude/fix-canonical-receipt-policies-261020-2005` |
| `20261026100300_dept_invites_ownership_fix.sql` | `claude/loving-lovelace-esc3l2` |
| `20261026110300_login_attempts_ttl_lgpd.sql` | `claude/loving-lovelace-esc3l2` |
| `20261026120300_log_search_event_rpc.sql` | `claude/loving-lovelace-esc3l2` |
| `20261026200300_fix-talkx-cron-startup-timeout.sql` | `claude/fix-talkx-cron-startup-timeout-261025-1700` |
| `20261026210300_outbound_post_started.sql` | `claude/feat-message-delivery-post-iniciado-261024-1719` |
| `20261026220300_revogar_grants_escrita_anon.sql` | `claude/fix-revogar-grants-escrita-anon-261025-2115` |
| `20261031150000_copilot_rls_supervisor_only.sql` | `claude/fix-copilot-rls-supervisor-261101-1530` |
| `20261031180000_copilot_commit_tick_rpc.sql` | `claude/fix-copilot-tick-atomicity-261101-1430` |
| `20261101133000_outbound_post_started.sql` | `claude/feat-message-delivery-post-iniciado-261101-1330` |
| `20261101140000_instance_pause_investigation.sql` | `claude/infra-c121-ddl-261101-1350` |
| `20261101150000_multiplix_cron_retoma_instancia_pausada.sql` | `claude/feat-multiplix-cron-instancia-pausada-261101-1410` |
| `20261101223000_talkx_suppression_reasons.sql` | `claude/feat-talkx-x070-suppression-reasons-261101-2230` |
| `20261101223000_talkx_x074_analytics_rpcs.sql` | `claude/feat-talkx-x074-analytics-rpcs-261101-2300` |
| `20261101233000_talkx_x086_template_metrics_rpcs.sql` | `claude/feat-talkx-x086-template-metrics-rpcs-261101-2300` |
| `20261101243000_talkx_x058_campaign_queue_segment.sql` | `claude/feat-talkx-x058-campaign-queue-segment-261101-2300` |
| `20261102012200_rls_department_invitations_admin_only.sql` | `claude/fix-migration-drift-20261102012200-261102-0900` |
| `20261108180000_copilot_tick_trigger.sql` | `claude/feat-copilot-radar-20261108-1800` |
| `20261108180200_copilot_retention.sql` | `claude/feat-copilot-radar-20261108-1800` |
| `20261111180000_resolve_unconfirmed_somente_sending.sql` | `claude/fix-pd79-compat-pre-migration-261111` |
| `20261113130200_conversation_status_regras_e_so_por_rpc.sql` | `claude/fix-conversas-p0-p1-backend-261113` |
| `20261113130400_varredura_mensagens_presas_em_enviando.sql` | `claude/fix-conversas-p0-p1-backend-261113` |
| `20261113130500_transfer_conversation_cas_sem_dono.sql` | `claude/fix-conversas-p0-p1-backend-261113` |
| `20261113130600_agendadas_conexao_do_contato_caida.sql` | `claude/fix-conversas-p0-p1-backend-261113` |
| `20261113140000_remove_enum_special_agent.sql` | `claude/feat-remove-special-agent-261113` |
| `_superseded/20261107121000_message_reactions_one_per_agent_constraint.sql` | `claude/fix-db-live-guard-dup-261109-1800` |

#### Colisão de número de versão — medido no ledger de produção em 16/11/2026

Consulta de leitura ao banco oficial (`supabase_migrations.schema_migrations`) com as 32 versões
acima: **5 constam como aplicadas**. Mas o arquivo da `main` que carrega aquele mesmo número é
**outra** migration, com outro nome e outro conteúdo:

| Versão | Arquivo só na branch | Arquivo na `main`, mesma versão |
|---|---|---|
| `20261016250000` | `e2e_fixture_message_rpc.sql` | `revoke_anon_write_grants_all_tables.sql` |
| `20261026210300` | `outbound_post_started.sql` | `reconcile_team_reactions_force_conversation_id_trig.sql` |
| `20261026220300` | `revogar_grants_escrita_anon.sql` | `classificar_rls_sem_policy.sql` |
| `20261102012200` | `rls_department_invitations_admin_only.sql` | `department_invites_restringe_escrita.sql` |
| `20261107121000` | `_superseded/message_reactions_one_per_agent_constraint.sql` | `message_reactions_one_per_agent.sql` |

Consequência prática: o ledger guarda **versão**, não conteúdo. Para a automação de apply essas
cinco versões já estão aplicadas, então o arquivo da branch **nunca seria executado** — seria
pulado em silêncio. Nenhum destes cinco pode ser recuperado reusando o número; o que for
recuperado precisa de versão nova por `reserve_migration_version`.

Isso **não** decide se o conteúdo faz falta. Em pelo menos um caso o trabalho chegou à `main`
renumerado: `revogar_grants_escrita_anon` e `revoke_anon_write_grants_all_tables` tratam do mesmo
assunto. A comparação é por conteúdo, item a item, e está na fila.

### Bloco A2 — código de aplicação, edge e E2E que não existe na `main`

| Arquivo | Branch (`origin/…`) |
|---|---|
| `e2e/fixtures/talkx-demo/tela-01.json` … `tela-17.json` (17 arquivos) | `claude/feat-talkx-x003-demo-fixtures-261101-2143` |
| `src/components/calls/__tests__/VoIPPanel.test.tsx` | `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` |
| `src/components/campaigns/__tests__/CampaignsView.test.tsx` | `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` |
| `src/components/connections/ConnectWhatsAppDialog.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/components/copilot/RadarPhase6Panel.tsx` | `claude/feat-radar-fase6-261108-1933` |
| `src/components/dashboard/SentinelAlertPanel.tsx` | `claude/ecstatic-bardeen-twiveb` |
| `src/components/inbox/__tests__/ContactPurchasesPanel.erro-gravacao.test.tsx` | `claude/fix-logger-vitest-mock-261017-1000` |
| `src/components/inbox/__tests__/ContactPurchasesPanel.total-erro-data.test.tsx` | `claude/fix-logger-vitest-mock-261017-1000` |
| `src/components/inbox/copilot/index.ts` | `claude/feat-copilot-radar-20261108-1800` |
| `src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx` | `claude/feat-talkx-x048-estados-servico-261101-2100` |
| `src/components/talkx/__tests__/talkxStates.matrix.test.tsx` | `claude/feat-talkx-x047-matrix-estados-261101-2030` |
| `src/components/talkx/kit/ServiceStatusSheet.tsx` | `claude/feat-talkx-x048-estados-servico-261101-2100` |
| `src/components/talkx/report/__tests__/TalkXCampaignReportExport.test.tsx` | `claude_juca/practical-rubin-8xnw0u` |
| `src/components/team-chat/__tests__/TeamChatView.cid.test.tsx` | `claude/feat-teamchat-cid-261021-0758` |
| `src/components/ui/AuroraBorealis.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/components/ui/FloatingParticles.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx` | `claude/feat-ui-visual-texto-longo-261101-1445` |
| `src/components/ui/__tests__/robustez-primitivos.test.tsx` | `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423` |
| `src/components/wallet/TransactionList.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/components/wallet/WalletCard.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/hooks/__tests__/useMotionSeguro.test.ts` | `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` |
| `src/hooks/admin/useMediaMigrationData.ts` | `claude_05/zen-feynman-29b7ix` |
| `src/hooks/chat/useCopilotSession.ts` | `claude/feat-copilot-radar-20261108-1800` |
| `src/hooks/connections/useConnections.ts` | `claude_pink/nice-hypatia-iikl82` |
| `src/hooks/connections/useInstancePauses.ts` | `claude/feat-completar-c121-261101-1330` |
| `src/hooks/copilot/useMultimodalAnalysis.ts` | `claude/feat-copiloto-edges-261101-1330` |
| `src/hooks/copilot/usePromptInjectionGuard.ts` | `claude/fix-logger-vitest-mock-261017-1000` |
| `src/hooks/crm/__tests__/useContactPurchases.criar.test.tsx` | `claude/fix-logger-vitest-mock-261017-1000` |
| `src/hooks/integrations/__tests__/useTalkXSegments.estimativa.test.tsx` | `claude/fix-talkx-segmentos-estimativa-261025-2110` |
| `src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts` | `claude/feat-talkx-x048-estados-servico-261101-2100` |
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | `claude/ecstatic-bardeen-twiveb` |
| `src/hooks/useMotionSeguro.ts` | `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` |
| `src/hooks/wallet/useWallet.ts` | `claude_pink/nice-hypatia-iikl82` |
| `src/shadcn/ui/button.tsx` | `claude_pink/nice-hypatia-iikl82` |
| `src/types/connections.ts` | `claude_pink/nice-hypatia-iikl82` |
| `supabase/functions/_shared/__tests__/send-message-manual-resolution-compat.test.ts` | `claude/fix-pd79-compat-pre-migration-261111` |
| `supabase/tests/instance_pause_investigation.sql` | `claude/feat-completar-c121-ddl-261101-1345` |

Dois conjuntos pedem atenção redobrada na adjudicação, porque **podem ser funcionalidade inteira**
que nunca entrou:

- **Carteira** — `WalletCard.tsx`, `TransactionList.tsx` e `useWallet.ts`, todos em
  `claude_pink/nice-hypatia-iikl82`, junto com `ConnectWhatsAppDialog.tsx`, `useConnections.ts` e
  `src/types/connections.ts`.
- **Radar / copiloto** — `RadarPhase6Panel.tsx`, `useCopilotSession.ts`,
  `useMultimodalAnalysis.ts` e `src/components/inbox/copilot/index.ts`, espalhados por quatro
  branches, com as migrations de copiloto do bloco A1 do lado.

### Bloco A3 — automação que não existe na `main`

38 caminhos: 21 em `scripts/ci/`, 12 em `scripts/db-audit/`, 1 em `scripts/db-migrate/`,
1 em `scripts/inventario/` e 4 workflows — `auto-update-pr-branch.yml`, `contexto-ia.yml`,
`main-failure-notify.yml` e `scorecard.yml`.

Workflow é item de "chame o dono" por regra: nenhum destes quatro entra sem decisão dele.

### Bloco B — documento de análise/auditoria (agregado)

572 caminhos, dos quais 384 são dossiês em `analise-prs/dossies`. São os agentes documentando o
próprio trabalho. Preservados por SHA de branch no `resumo.tsv`; não listados um a um aqui porque
nenhum deles é funcionalidade do sistema.

### Bloco C — a `main` tem o arquivo, em versão sem todas as linhas da branch

2.231 pares em código funcional:

| Linhas ausentes | Pares |
|---|---|
| 1–2 | 761 |
| 3–10 | 638 |
| 11–50 | 717 |
| acima de 50 | 115 |

A fila de adjudicação começa pelos 115 acima de 50 linhas. Os maiores, para dar a escala:
`useTalkXSegments.ts` (206 de 602 linhas, `fix/f1a-lote-b-talkxsegments`), `useAdminData.ts`
(198 de 312, `claude/ecstatic-bardeen-twiveb`), `TalkXSegments.tsx` (183 de 573,
`claude/fix-talkx-segmentos-estimativa-261025-2110`), `evolution-api/index.ts` (174 de 978,
`fix/ci-verde-261021`), `copilot-live/index.ts` (173 de 263,
`claude/feat-copilot-radar-20261108-1800`) e `useRadarPanel.ts` (134 de 137,
`claude/fix-radar-fase6-cv056-shortcuts-261108-2335`).

## Leitura honesta do bloco C

As **maiores** diferenças de linha do repositório inteiro não são funcionalidade perdida, e isso
está medido:

- `supabase/schema-manifest.json` e `scripts/ci/eslint-baseline.json` lideram a lista bruta, com
  até 1.929 e 1.064 linhas ausentes. São **artefatos gerados**: a `main` tem a versão regerada
  depois, e a da branch é um retrato antigo do mesmo banco e do mesmo baseline.
- `CLAUDE.md` aparece com "526 de 526 linhas ausentes" em várias branches. O arquivo foi
  reescrito na `main` para apontar para o `AGENTS.md`, que hoje é onde as regras moram. As regras
  não se perderam: mudaram de arquivo.

Por isso o bloco C conta só código funcional, e a fila começa acima de 50 linhas.

## Índice de restauração

`$OUT/resumo.tsv` tem uma linha por branch com o SHA do tip. Qualquer branch desta medição é
restaurável por esse SHA mesmo depois de apagada:

```
git fetch origin <sha>          # ou github_create_ref apontando para ele
```

A regra operacional: **a branch só é fechada depois de o SHA dela estar escrito no recibo de
fechamento**, junto do motivo. Foi o que o recibo de 16/11
(`analise-prs/BRANCHES-FECHADAS-261116.md`) já fez para as 71 primeiras.

## O que ainda NÃO está decidido

Este documento é o inventário, não a conclusão. Cada linha dos blocos A1, A2 e A3, e cada item da
fila do bloco C, ainda precisa de um veredito individual: **recuperar** (a funcionalidade falta
na `main` e o trabalho é aproveitável — então é terminado e entra por PR) ou **obsoleto** (com o
motivo escrito e verificável). Enquanto um item não tiver veredito, a branch dele não é fechada.

**NÃO VERIFICADO** neste documento: se cada arquivo do bloco A corresponde a funcionalidade que
falta na `main`. A prova byte a byte diz que o arquivo não está lá; ela não diz se o
comportamento dele chegou por outro caminho, com outro nome. É exatamente esse o veredito que
falta, e ele é feito arquivo por arquivo.
