# Recuperação total do trabalho em branches — 16/11/2026

**Regra que este documento serve:** nenhuma branch e nenhuma PR é fechada sem prova byte a byte
de que o trabalho dela já está na `main` (ou em outra branch), ou de que ficou obsoleto. Trabalho
parcial de outro agente não é descartado: é terminado.

Enquanto o trabalho existia só dentro de uma branch, ele dependia de a branch não ser apagada.
Com este arquivo e o `analise-prs/recuperacao-261116-branches.tsv` na `main`, cada arquivo não
incorporado tem caminho e branch registrados, e cada branch tem o SHA do tip — ela volta com um
comando mesmo depois de apagada.

`main` no momento da medição: `714e2b659db2b19a539b1651d0b0c3be25a7ffc5`

Medição reproduzível por `scripts/recuperacao-branches/`; o README de lá tem a ordem, a variável
`OUT` e o recorte de cada bloco.

## O que foi medido

222 refs remotas — todas, exceto `main` e a gerada `contexto`. Uma delas é a branch desta própria
PR, que entrou na medição depois de ser publicada: são **221 branches de trabalho de outros
agentes**, mais esta.

Para cada branch, os arquivos que ela **introduz** em relação ao seu ponto de bifurcação
(`git diff --name-only --diff-filter=AMRT $(git merge-base origin/main B) B`) passam por três
provas, em ordem:

1. **Mesmo caminho, mesmo byte** — `git rev-parse B:arquivo` igual a
   `git rev-parse origin/main:arquivo`. Trabalho incorporado.
2. **Mesmo byte em outro caminho** — o blob da branch aparece em `git ls-tree -r origin/main`.
   Pega arquivo movido ou renomeado, que a prova 1 não pega.
3. **Contenção por linha** — toda linha da versão da branch aparece na versão da `main`. Fora da
   comparação fica só linha **estrutural pura** (chaves, parênteses, vírgula, ponto e vírgula,
   marcação de comentário). Se nada falta, a `main` é superconjunto: o trabalho está lá, em
   arquivo que evoluiu depois.

| Resultado | Pares (arquivo, branch) |
|---|---|
| Mesmo caminho e mesmo byte, ou mesmo blob em outro caminho | 1.084 |
| Contido linha por linha | 201 |
| **NOVO** — não existe na `main` em caminho nenhum | 730 (558 caminhos distintos) |
| **PARCIAL** — a `main` tem o arquivo, falta alguma linha | 2.934 |
| **PARCIAL-REMOÇÃO** — a `main` tem todas as linhas da branch, mas a branch REMOVEU linha que a `main` ainda tem | 7 |

Os 1.084 + 201 são o ganho desta medição em relação a olhar nome de arquivo: trabalho que **já
está** incorporado, parte dele em caminho diferente do original.

### Por que o filtro de linha mudou, e o que isso alterou

A primeira versão deste gate descartava da comparação toda linha com menos de 8 caracteres. O
Codex apontou o defeito na PR #3192 e ele foi **reproduzido** antes da troca: `true;` (5
caracteres) contra `false;` (6) caía fora da comparação, e um arquivo com a regra **invertida**
saía como `CONTIDO` com zero linhas ausentes. Corte por tamanho era a ideia errada — o que não
distingue comportamento é linha estrutural.

Efeito medido da correção nesta base: **exatamente 1 par** mudou de lado, `CONTIDO` 209 → 208 e
`PARCIAL` 2.933 → 2.934. O par é `infrastructure/preview-egress-proxy/go.mod` em
`claude_pink/cool-dijkstra-xk9ek2` — um `go.mod`, onde linha curta (`go 1.22`) é justamente o que
importa. A fila de adjudicação não se moveu, porque `go.mod` não é código de aplicação.

### Remover também é trabalho: dois pontos cegos maiores

O erro de concepção mais grave do gate original não era de filtro, e aparece em duas camadas: eu
tratei "a `main` tem o que a branch tem" como equivalente a "o trabalho da branch está
incorporado". **Remover é trabalho**, e nenhuma das duas formas de remoção contava.

- **Deleção de arquivo.** O filtro `AMR` descarta `Deleted`, então uma branch cujo trabalho é
  remover código morto saía com tudo zerado — igual a uma branch sem pendência, e "nada a fazer"
  é justamente o que autoriza fechar. Medido: **4 branches, 12 arquivos**, detalhados em
  `analise-prs/RECUPERACAO-261116-DELECOES.md`.
- **Remoção de linha.** Se a branch tira uma instrução de arquivo que continua existindo,
  `linhas(branch) − linhas(main)` fica vazio e o par saía como `CONTIDO`. O teste correto precisa
  do ponto de bifurcação: linha que existia lá, a branch tirou e a `main` ainda tem. Medido:
  **7 dos 208 pares `CONTIDO`**, nominalmente em
  `analise-prs/recuperacao-261116-remocoes-de-linha.tsv` — e **dois são migration**, a categoria
  de maior risco do inventário.

Os dois achados são do Codex, na revisão desta PR. Outros três mecanismos foram cobertos com
impacto zero nesta base: modo de arquivo (`100644` contra `100755`), branch já incorporada por
merge — que passa a ser marcada `INCONCLUSIVA-ANCESTRAL` em vez de sair da fila em silêncio — e
troca de tipo de arquivo (`T`).

**Correção de 17/11 sobre a troca de tipo.** A revisão da #3195 mostrou que o `T` resolve só
metade: ele faz a troca **entrar** na lista, mas a classificação seguinte decide por **conteúdo**,
sem olhar o tipo. `01-gate-blob.sh:69-71` compara o modo num único caminho (blob igual no mesmo
caminho); o caminho de "arquivo movido" (`:72`) aceita qualquer blob presente na `main` sem olhar
modo; e `02-contencao-linha.py` descarta o modo ao ler a árvore (`:18-20`) e nunca o recebe, pois
`unicos.tsv` só carrega `(branch, caminho, blob)` (`01-gate-blob.sh:73`). Reproduzido num repo
descartável: `ponte.js` como arquivo regular contendo `target.js` na `main`, trocado por symlink
na branch, sai **`CONTIDO`** — isto é, "já incorporado", embora a `main` ainda tenha um arquivo
regular. Sem newline final, os blobs ficam iguais e a primeira etapa já o considera incorporado.
**Efeito nesta base: nenhum** — 0 pares `T` encontrados e a `main` não tem symlink nenhum. A
correção de código (levar o modo até o veredito) fica registrada e não foi aplicada.

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
assunto. A comparação é por conteúdo, item a item, e o resultado do primeiro lote está em
`analise-prs/VEREDITOS-RECUPERACAO-261116.md`.

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

O conjunto de **carteira e conexão WhatsApp** da `claude_pink/nice-hypatia-iikl82` já foi
adjudicado: são stubs, e recuperar seria regressão. Ver
`analise-prs/VEREDITOS-RECUPERACAO-261116.md`.

Segue sem veredito o conjunto de **radar / copiloto** — `RadarPhase6Panel.tsx`,
`useCopilotSession.ts`, `useMultimodalAnalysis.ts` e `src/components/inbox/copilot/index.ts`,
espalhados por quatro branches, com as migrations de copiloto do bloco A1 do lado.

### Bloco A3 — automação que não existe na `main`

38 caminhos: 21 em `scripts/ci/`, 12 em `scripts/db-audit/`, 1 em `scripts/db-migrate/`,
1 em `scripts/inventario/` e 4 workflows — `auto-update-pr-branch.yml`, `contexto-ia.yml`,
`main-failure-notify.yml` e `scorecard.yml`.

Workflow é item de "chame o dono" por regra: nenhum destes quatro entra sem decisão dele.

### Bloco B — documento de análise/auditoria (agregado)

572 caminhos, dos quais 384 são dossiês em `analise-prs/dossies`. São os agentes documentando o
próprio trabalho. Preservados pelo SHA de branch no TSV versionado; não listados um a um aqui
porque nenhum deles é funcionalidade do sistema.

### Bloco C — a `main` tem o arquivo, em versão sem todas as linhas da branch

2.231 pares em código funcional. A triagem que separa trabalho não recuperado de trabalho
superado está nos vereditos: em **1.259** desses pares a branch tem o arquivo **menor** que a
`main`, o que coloca a `main` à frente; os outros 972, deduplicados por conteúdo, são **873
versões distintas** em 506 arquivos. Dessas, 673 são arquivo de teste e só 11 têm mais casos que
a `main`.

## Leitura honesta do bloco C

As **maiores** diferenças de linha do repositório inteiro não são funcionalidade perdida, e isso
está medido:

- `supabase/schema-manifest.json` e `scripts/ci/eslint-baseline.json` lideram a lista bruta, com
  até 1.929 e 1.064 linhas ausentes. São **artefatos gerados**: a `main` tem a versão regerada
  depois, e a da branch é um retrato antigo do mesmo banco e do mesmo baseline.
- `CLAUDE.md` aparece com "526 de 526 linhas ausentes" em várias branches. O arquivo foi
  reescrito na `main` para apontar para o `AGENTS.md`, que hoje é onde as regras moram. As regras
  não se perderam: mudaram de arquivo.

## Índice de restauração

`analise-prs/recuperacao-261116-branches.tsv` tem uma linha por branch desta medição, com o SHA
do tip e as quatro contagens. É o único dado do recibo que **não** é recomputável depois de a
branch ser apagada, e por isso está versionado em vez de ficar em diretório temporário.

```
git fetch origin <sha>          # ou github_create_ref apontando para ele
```

A regra operacional continua: **a branch só é fechada depois de o SHA dela estar escrito no
recibo de fechamento**, junto do motivo. Foi o que o recibo de 16/11
(`analise-prs/BRANCHES-FECHADAS-261116.md`) já fez para as 71 primeiras.

## O que ainda NÃO está decidido

Este documento é o inventário. Os vereditos ficam em
`analise-prs/VEREDITOS-RECUPERACAO-261116.md`, e cada linha dos blocos A1, A2 e A3, e cada item
da fila do bloco C, precisa de um: **recuperar** (a funcionalidade falta na `main` e o trabalho é
aproveitável — então é terminado e entra por PR) ou **obsoleto** (com motivo verificável).
Enquanto um item não tiver veredito, a branch dele não é fechada.

**NÃO VERIFICADO** neste documento: se cada arquivo do bloco A corresponde a funcionalidade que
falta na `main`. A prova byte a byte diz que o arquivo não está lá; ela não diz se o
comportamento dele chegou por outro caminho, com outro nome.

## Reproduzir

Os dois scripts da medição estão em `scripts/recuperacao-branches/`, com a ordem e a variável
`OUT` documentadas no README de lá.
