# Auditoria integral de metadados de PRs e issues, com reconciliação detalhada das abertas

- Snapshot: 03/10/2026, aproximadamente 22:03–22:25 UTC.
- Repositório: https://github.com/adm01-debug/Zapp_Web_V2
- Baseline de código: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`.
- Escopo de ações: apenas leituras GitHub e Git; nenhum comentário, fechamento, merge, alteração de configuração ou operação no banco foi executado por esta frente.

## 1. Cobertura verificável

Foram coletadas **1.828 PRs** (1.676 incorporadas, 140 fechadas sem merge e 12 abertas), em 19 páginas de 100 entradas: as 18 primeiras completas e a última com 28. Foram coletadas **41 issues** (14 abertas e 27 fechadas), com `incomplete_results=false`. A união dos IDs é exatamente `1..1869`, sem lacunas ou duplicatas. Isso demonstra completude do inventário de PRs/issues até o corte, sem depender da contagem de resultados de uma busca limitada.

Todas as 12 PRs abertas foram detalhadas: **75 arquivos/patches**, **888 comentários de conversa**, **67 reviews**, **24 comentários inline** e **20 threads**; as 20 threads permanecem não resolvidas no GitHub, mas três já são marcadas outdated. Também foram capturados todos os 66 comentários existentes das issues abertas.

A análise semântica profunda abrange as 12 PRs abertas, PRs históricas que as substituem e as 14 issues abertas. As 1.828 PRs possuem metadados, body, head/base e merge SHA; **isso não significa que cada linha dos 1.828 diffs históricos recebeu revisão semântica individual**. O inventário bruto e normalizado permite essa navegação sem novo levantamento.

## 2. A main não está completamente verde

O status combinado simples retorna `success` na main e em todas as PRs abertas. A API de check-runs expõe falhas adicionais; consultar só commit status produziria uma conclusão incorreta.

| Verificação na main | Estado / causa demonstrada | Evidência |
|---|---|---|
| Contrato DB vivo | Falha: 779 migrations no repositório, 781 no ledger; artefatos derivados divergentes. | [Run 37155983222](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155983222) |
| Contrato DB offline | Falha de bootstrap do PostgreSQL descartável: socket ausente, exit 2 após tentativas. Não demonstra reprovação de RLS. | [Run 37155670839](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155670839) |
| SonarCloud | Quality Gate: Reliability D e Security C em código novo, exigindo A. Os achados individuais do Sonar não foram extraídos aqui. | `main-check-runs.raw.json` |
| Build, Unit, E2E geral, Lint, Security | Sucesso no SHA observado. Não substituem os gates acima. | `main-check-runs.raw.json` |
| E2E logado | Cancelado; não equivale a cenário autenticado validado. | `main-check-runs.raw.json` |

### Drift vivo exato observado às 21:42 UTC

O log do guard registra duas versões no ledger sem arquivo em `supabase/migrations`:

- `20261003182707` — `fixture_e2e_aba_arquivos_midia`.
- `20261003192707` — `fixture_e2e_aba_arquivos_segunda_midia`.

O mesmo run encontrou divergência em types, catálogo, manifesto e baseline de grants; a paridade de diretórios de Edge Functions foi 73/73. Atualizar os quatro artefatos da PR #1863 não resolve automaticamente as duas entradas extras do ledger. Estas observações são provas históricas daquele run, não uma consulta nova da auditoria ao banco de produção.

### Falhas de infraestrutura devem manter sua causa

Na PR #1863, o job Security falhou porque a consulta do usuário do GitHub ficou indisponível e o gitleaks passou a exigir licença; o log não apresenta um segredo detectado como causa. O DB offline da mesma PR repete o bootstrap PostgreSQL ausente. Na #1636, ao contrário, o lint falha efetivamente em asserção do manifesto: `orphan_allowlist=[]`, quando eram esperados `sicoob-bridge` e `sicoob-bridge-reply`.

## 3. Decisão por PR aberta

| PR | Head | Draft | Merge/API | Arquivos | Falhas de check-run | Classificação |
|---|---|---|---|---:|---|---|
| [#1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869) | `a2d9f62d5a67` | sim | blocked | 25 | Nenhuma falha; revisar cancelados/skips | `AUDIT_CHECKPOINT_DRAFT` |
| [#1863](https://github.com/adm01-debug/Zapp_Web_V2/pull/1863) | `a5e0c8070e24` | não | blocked | 4 | 🔒 Security Audit, Contrato DB offline | `ACTIVE_DERIVED_ARTIFACT_SYNC_BLOCKED` |
| [#1713](https://github.com/adm01-debug/Zapp_Web_V2/pull/1713) | `92e6f5844988` | não | clean | 1 | Nenhuma falha; revisar cancelados/skips | `ACTIVE_STATUS_AUTOMATION` |
| [#1699](https://github.com/adm01-debug/Zapp_Web_V2/pull/1699) | `139811c3e550` | não | dirty | 1 | Contrato DB offline | `SUPERSEDED_WITH_INHERITED_DEFECT` |
| [#1654](https://github.com/adm01-debug/Zapp_Web_V2/pull/1654) | `82c5fd6c7030` | sim | clean | 30 | Nenhuma falha; revisar cancelados/skips | `ACTIVE_UI_DRAFT_DEPENDENT_ROLLOUT` |
| [#1636](https://github.com/adm01-debug/Zapp_Web_V2/pull/1636) | `e7917922b859` | não | dirty | 5 | 🔍 Lint & TypeCheck | `ACTIVE_EDGE_WITH_CONFIRMED_REGRESSION` |
| [#1621](https://github.com/adm01-debug/Zapp_Web_V2/pull/1621) | `74783271e82c` | sim | clean | 1 | Nenhuma falha; revisar cancelados/skips | `UNMERGED_PLAN_DRAFT` |
| [#1610](https://github.com/adm01-debug/Zapp_Web_V2/pull/1610) | `e4143de7d040` | sim | clean | 2 | Nenhuma falha; revisar cancelados/skips | `POLICY_MOTIVATED_DRAFT_NEEDS_CURRENT_REQUIREMENT` |
| [#1584](https://github.com/adm01-debug/Zapp_Web_V2/pull/1584) | `33f042682054` | sim | dirty | 1 | 🔍 Lint & TypeCheck, Contrato DB offline | `SUPERSEDED_BY_COMPLETE_SYNC` |
| [#1439](https://github.com/adm01-debug/Zapp_Web_V2/pull/1439) | `3323533e8cb6` | não | blocked | 1 | 🔍 Lint & TypeCheck | `UNMERGED_DEBOUNCE_DESIGN_DEFECT` |
| [#1430](https://github.com/adm01-debug/Zapp_Web_V2/pull/1430) | `82a9cc5efeaa` | não | blocked | 3 | Nenhuma falha; revisar cancelados/skips | `OBSOLETE_TEST_SUPPRESSION_PROPOSAL` |
| [#1206](https://github.com/adm01-debug/Zapp_Web_V2/pull/1206) | `ea107e527cb7` | não | dirty | 1 | Contrato DB offline | `SUPERSEDED_ATTESTATION_POLICY_WITH_REGRESSIONS` |

### Reconciliação semântica e ação proposta

#### PR #1869 — docs(reconciliation): checkpoint da auditoria exaustiva do projeto

**Decisão:** Manter checkpoint; atualizar somente documentação quando autorizado, sem merge automático.

25 arquivos exclusivamente docs/reconciliation; 25 commits; todos os checks executados concluíram sem falha; draft e mergeable_state=blocked.

Riscos e limites:

- Não é código de produto nem prova de que backlog esteja concluído.
- Metadados anteriores da auditoria (12 PRs/14 issues) precisam ser reconciliados com este snapshot.

Threads abertas: 0; abertas e não outdated: 0.

#### PR #1863 — chore(db): sincronizar artefatos derivados do banco

**Decisão:** Revisar diffs gerados e ACL de trigger; resolver gates de infraestrutura e só então considerar adoção com nova verificação de frescor.

Origem main2e7cf81; 4 artefatos types/catalog/manifest/grants; Security falhou por obtenção de usuário indisponível seguida de gitleaks license missing, e DB offline por bootstrap Postgres exit2, não por secret/contrato demonstrados.

Riscos e limites:

- Uma thread aberta sobre EXECUTE PUBLIC em record_talkx_campaign_lifecycle_event; função trigger interna (não equivale a RPC explorável demonstrada).
- Atualizar artefatos não reconcilia automaticamente as 2 migrations extras no ledger vivo.
- Combined status success não inclui as falhas check-runs.

Threads abertas: 1; abertas e não outdated: 1.

#### PR #1713 — chore(talkx): regenera STATUS.md (placar)

**Decisão:** Revisar placar gerado contra evidencia da main e preservar branch reutilizada.

1 arquivo docs/talkx/v4/STATUS.md; origem main2e7cf81; checks verdes; 624 comentários paginados em 7 páginas.

Riscos e limites:

- Alta atividade de bots pode mascarar última evidência útil.
- Placar de tarefas não atesta execução/runtime.

Threads abertas: 0; abertas e não outdated: 0.

#### PR #1699 — fix(a11y): auditoria de dev espera o app montar antes de medir

**Decisão:** Candidata a encerrar como duplicada de #1715; carregar a dívida real a11y para backlog separado.

main src/main.tsx:68 contém exatamente o guard querySelector('main') proposto; gitlog prova merge#1715 c1640eac. 3 threads não resolvidas criticam supressão de auditoria. DB offline do head é bootstrap exit2.

Riscos e limites:

- ForgotPassword e NotFound sem main perdem todos os resultados axe no baseline atual.
- A existência do landmark não prova que descendants/rota terminaram de carregar.
- Branch conflita com main; incorporar não acrescenta a correção pretendida.

Threads abertas: 3; abertas e não outdated: 3.

#### PR #1654 — feat(sidebar): painel do contato com 3 seções (Profissional, Pessoal, Perfil Singu)

**Decisão:** Revisar interface e integração da UI, manter separação entre merge UI com flag off e habilitação Singu/CRM.

30 arquivos, 11 commits; camada C#1642 já merged; frontend novo não está em main; checks verdes. Quatro threads ainda abertas; três outdated e todas têm respostas de correção, normalizeE164BR confirmado no head.

Riscos e limites:

- RPC do Singu e edgeB#1636 dependentes para caminho flag on.
- Testes E2E usam rotas CRM mockadas; não comprovam RPC e produção.
- Remove 3 arquivos antigos (SHA de arquivo removido ser igual ao main significa remoção ainda pendente).
- 13 componentes descritos como órfãos futuros; não excluir antes da troca e verificação de imports.

Threads abertas: 4; abertas e não outdated: 1.

#### PR #1636 — feat(edge): lookup sidebar no crm-integration

**Decisão:** Reconciliar com main, manter allowlist de funções remotas e validar contrato sidebar antes de qualquer merge/deploy.

5 arquivos e 6 commits; remove orphan_allowlist de sicoob-bridge/sicoob-bridge-reply; log lint actual[] expected[sicoob-bridge,sicoob-bridge-reply]; conflito de merge.

Riscos e limites:

- Sem allowlist, pós-deploy pode classificar as duas edges remotas como extras permanentes e bloquear toda atestação.
- Contrato get_contact_sidebar_by_phone externo e flag não são comprovados por esta PR.
- Alterar contrato shared recalcula hashes de multiplix-audience/dispatch, além de crm-integration.

Threads abertas: 1; abertas e não outdated: 1.

#### PR #1621 — docs(sidebar): plano em 100 etapas — painel do contato com 3 seções (Profissional, Pessoal, Perfil Singu)

**Decisão:** Reconciliar decisões D1-D7 e execução posterior no plano, preservar como origem documental.

1 arquivo PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md ausente em main; checks verdes; PRbody ainda afirma nenhuma etapa executada, embora#1642 merged e#1654/#1636 existam.

Riscos e limites:

- Não transformar todas as 100 etapas em pendência nova: o texto está historicamente desatualizado.
- Alegações sobre flag e linhas em banco são medições declaradas de02/10, não atestado vivo03/10.

Threads abertas: 0; abertas e não outdated: 0.

#### PR #1610 — ci: substitui oven-sh/setup-bun e denoland/setup-deno por shell (política org)

**Decisão:** Validar requisito atual da política de Actions e avaliar custo de manter instaladores shell antes de priorizar.

2 arquivos; troca setup-bun/setup-deno por downloads com SHA256 fixo. Falha histórica#1439 em01/10 prova política restritiva naquele momento; main03/10 usa as actions e CI passa.

Riscos e limites:

- Não é demonstrado um bloqueio atual de toda CI pela política histórica.
- Instaladores copiados por seis jobs ampliam manutenção; não cobrem automaticamente outros workflows.

Threads abertas: 0; abertas e não outdated: 0.

#### PR #1584 — fix: remove kick_talkx_campaign do baseline known-violations (desbloqueia types-sync)

**Decisão:** Candidata a encerrar como superada por#1587, preservando referência histórica.

main known-violations não contém kick_talkx_campaign; gitlog#1587 bed17931. Head antigo remove baseline sem atualizar catálogo, gerando nova violação em lint e DB offline.

Riscos e limites:

- Não reaplicar patch antigo de comments/base sobre catálogo atual.
- Não confundir falha histórica do guard com inexistência atual da RPC.

Threads abertas: 0; abertas e não outdated: 0.

#### PR #1439 — ci(types-sync): debounce E17 + paths-negation E18

**Decisão:** Reprojetar debounce com execução tardia garantida e timestamp do commit antes de incorporar.

49 adições em types-sync; skip por20min com PR.updated_at, sem requeue; busca só20 PRs por label. 5 threads abertas. Falha CI capturada é política Actions01/10, além dos defeitos estáticos da proposta.

Riscos e limites:

- Push de migration pode ser descartado até próximo schedule semanal/manual.
- Comentários e reviews renovam updated_at sem mudar head.
- Busca não paginada pode não encontrar sync PR com>20 abertas.

Threads abertas: 5; abertas e não outdated: 5.

#### PR #1430 — fix(e2e): test.fixme nos 3 specs flaky (E09)

**Decisão:** Candidata a encerrar/superar após mapear correções posteriores; preservar testes úteis.

Introduz fixme incondicional em volume/reactions e condicional WebKit; baseline já usa Enter para volume, última mensagem+perfil pronto nas reações e combobox nomeado no TalkX. 4 threads abertas; E2E check mais recente cancelled, outro anterior success.

Riscos e limites:

- Silencia cobertura sem tratar causa atual; o próprio teste volume não usa long press.
- Outro teste de toggle compartilha interação suspeita e continuaria rodando.

Threads abertas: 4; abertas e não outdated: 4.

#### PR #1206 — fix: E09 — attestation não trava quando version não bumpa na Management API

**Decisão:** Candidata a encerrar como substituída pela linhagem#1376/#1671/#1757; não reaplicar fallback temporal sem prova.

main preserva baseline version=null, aceita digest idêntico e falha contradição CLI/digest; PR remove bypass null e aceita updated_at. 2 threads abertas. CIhead DB offline falhou versão de migration duplicada20260930390000 em01/10.

Riscos e limites:

- Versão null+knownUnchanged torna condições impossíveis e consome todas tentativas.
- Timestamp posterior pode aceitar versão regressiva e atribuir deploy antigo ao SHA atual.
- Conflito com main e política de atestação evoluída.

Threads abertas: 2; abertas e não outdated: 2.

## 4. Todas as 14 issues abertas reconciliadas

As correspondências corretas dos três defeitos de segurança são **#1265 → PR #1309**, **#1266 → PR #1313**, **#1267 → PR #1314**. As três PRs foram incorporadas em 30/09/2026, mas as issues permanecem abertas. Código corrigido, aplicação em um banco e validação funcional atual são estados distintos.

### [Issue #1862](https://github.com/adm01-debug/Zapp_Web_V2/issues/1862) — `ACTIVE_VERIFIED_LIVE_DRIFT`

No log do main às21:42UTC03/10:779migrations no repo,781no ledger, extras20261003182707 e20261003192707 (fixtures de mídia); types/catalog/manifest/grants desatualizados;73edges declaradas/73diretórios.

**Próximo passo:** Reconciliar ledger e artefatos com evidência imutável. Não confundir sync#1863 com resolução das duas fixtures.

### [Issue #1854](https://github.com/adm01-debug/Zapp_Web_V2/issues/1854) — `ACTIVE_OBSERVABILITY_GAP_NOT_CONFIRMED_SETTINGS_REGRESSION`

Comentário21:13UTC:7merge settings lidas como null; branch protection e actions403; tentativa restore allow_auto_merge403. Falta leitura suficiente para afirmar divergência real.

**Próximo passo:** Separar ausência/erro de API de valor booleano falso; medir permissões autorizadas e impedir correções cegas por null.

### [Issue #1810](https://github.com/adm01-debug/Zapp_Web_V2/issues/1810) — `CURRENT_BRANCH_HYGIENE_REPORT_REQUIRES_FILTERING`

Relatório03/10 lista origin como candidato junto a três refs. origin representa potencial ref simbólica/remoto e não é automaticamente branch deletável.

**Próximo passo:** Usar inventário branch SHA+PR+conteúdo do agenteGit; excluir refs simbólicas e branches reutilizadas de qualquer poda.

### [Issue #1454](https://github.com/adm01-debug/Zapp_Web_V2/issues/1454) — `HISTORICAL_FAILURE_SUPERSEDED_BY_CURRENT_SYNC_PR`

Última falha registrada02/10; atual main tem dois jobs types-sync success, gerou#1863 baseada no main2e7cf81. Falha de propor sync não equivale ao bloqueio dos checks da PR.

**Próximo passo:** Reconciliar issue antiga após confirmar objetivo do gate e execução mais recente; manter problemas de CI/ACL/ledger em tarefas específicas.

### [Issue #1267](https://github.com/adm01-debug/Zapp_Web_V2/issues/1267) — `FIX_MERGED_SOURCE_CONFIRMED_LIVE_UNVERIFIED`

#1314 merged; últimas definições dos2guards em20260930300000_multiplix_guards_fail_closed.sql levantam42501 quando caller authenticated não tem auth.role; nenhuma redefinição posterior achada. Harness cobre erro.

**Próximo passo:** Não reimplementar correção existente; validar aplicação e comportamento vivo autorizado antes de encerrar segurança.

### [Issue #1266](https://github.com/adm01-debug/Zapp_Web_V2/issues/1266) — `FIX_MERGED_SOURCE_CONFIRMED_LIVE_UNVERIFIED`

#1313 merged (migration20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql); código e harness corrigem ambiguidade e recursão; snapshot posterior registra hashes. Issue ainda aberta, sem comentários.

**Próximo passo:** Validar replay/aplicação e SELECT autenticado atual; não contar correção como nova pendência de implementação.

### [Issue #1265](https://github.com/adm01-debug/Zapp_Web_V2/issues/1265) — `FIX_MERGED_SOURCE_CONFIRMED_LIVE_UNVERIFIED`

#1309 merged (migration20260930260000_team_reaction_membership_guard.sql), reforça associação de conversa em RPCs/policies reactions e receipts. Código+harness no baseline, issue ainda aberta.

**Próximo passo:** Validar caminho RPC e INSERT direto em ambiente autorizado; confirmar isolamento e estado vivo antes de encerrar.

### [Issue #382](https://github.com/adm01-debug/Zapp_Web_V2/issues/382) — `HISTORICAL_PLAN_RECONCILIATION`

Issue pede status E01-E100 em plano antigo; projeto já tem linhagens posteriores e#1713 automatiza STATUS doV4. A existência do placarV4 não edita retroativamente o documento antigo.

**Próximo passo:** Mapear linhagem e status histórico, arquivar/substituir explicitamente; não duplicarE01-E100 como novas100tarefas.

### [Issue #380](https://github.com/adm01-debug/Zapp_Web_V2/issues/380) — `PARTIALLY_DOCUMENTED_EXTERNAL_OPERATION_UNVERIFIED`

Existem docs/runbooks/secret-rotation.md e cron-secret-rotation.md, mas busca em runbooks/ops não localizou runbook específicoevolution/restart; agendamento e rotação efetiva não são comprovados por código.

**Próximo passo:** Verificar cadência/execução com responsável; completar runbook exato daVPS/containers sem executar rotação por esta auditoria.

### [Issue #378](https://github.com/adm01-debug/Zapp_Web_V2/issues/378) — `HISTORICAL_REMOTE_CLEANUP_PARTIAL_LOCAL_UNKNOWN`

Comentários26/09 declaram85branches remotas removidas e apenasmain+automation/types-sync naquele instante; original diz auto-delete desligado mas comentários corrigem paratrue. Inventário atualGit é diferente; locais/stashes/pasta irmã não são observáveis neste clone.

**Próximo passo:** Atualizar relato temporal, reaplicar análise porSHA e preservar trabalho exclusivo; manter máquina original como desconhecida.

### [Issue #377](https://github.com/adm01-debug/Zapp_Web_V2/issues/377) — `AUDIT_PARTIALLY_AUTOMATED_CURRENT_DRIFT`

Checks atuais medem drift/ledger/paridade; main viva21:42falha com779/781. Auditorias posteriores não tornam todaRLS de setembro automaticamente conforme; documentoRLS abril merece revisão histórica.

**Próximo passo:** Consolidar evidência por contrato e tabela; corrigir drift sob plano de execução autorizado e avaliar documentação obsoleta.

### [Issue #376](https://github.com/adm01-debug/Zapp_Web_V2/issues/376) — `PARTIALLY_IMPLEMENTED_COVERAGE_SCOPE`

vitest.config.ts já inclui location-picker e ContactForm além de lib/services, com piso de mapa85%lines/75%branches. Hooks e maioria dos componentes continuam fora do include.

**Próximo passo:** Atualizar escopo residual por módulo e medir antes de ampliar. Não repetir afimação de que sólib/services entram.

### [Issue #375](https://github.com/adm01-debug/Zapp_Web_V2/issues/375) — `PARTIALLY_REFACTORED_GOD_FILES_PERSIST`

talkxShared.tsx antigo está ausente; TalkXCampaignRunning.tsx tem840linhas e useCampaignEditor.ts932 no baseline. ESLint não contém max-lines. Requisito 'antes da fase2' é histórico.

**Próximo passo:** Mapear responsabilidades atuais e testes já existentes, separar refactors concretos de etapa antiga.

### [Issue #374](https://github.com/adm01-debug/Zapp_Web_V2/issues/374) — `PARTIAL_REDUCTION_WITH_EXISTING_LINT_RATCHET`

Regex ':any|as any' com whitespace conta68ocorrências no srcTS/TSX; ESLintbaseline contém66issues no-explicit-any e configextendsrecommended. Contagem histórica253 e afirmação 'semratchet' não refletem esse baseline. Métodosregex/AST/baseline não são intercambiáveis.

**Próximo passo:** Reconciliar critério original com ratchet já existente; medir execução fresca antes de afirmar total de diagnósticos atuais; residualmeta<50.

## 5. Sobreposição e riscos que atravessam PRs

Não há caminho de arquivo repetido entre os conjuntos de mudanças das 12 PRs abertas (75 entradas no total). Isso não elimina conflitos com a main nem dependências semânticas:

- **Sidebar:** #1621 é o plano não incorporado; #1642 já incorporou a camada de dados; #1636 adiciona o caminho de Edge/RPC; #1654 troca a UI e usa fallback com flag desligada. Testes mockados de UI não atestam o Singu vivo.
- **Contrato de implantação:** #1636 altera um helper compartilhado, afetando hashes de funções Multiplix; sua remoção de allowlist afeta a atestação de todas as edges. #1206 propõe política de atestação anterior ao reforço #1376.
- **Sincronização:** #1439 pretende reduzir execuções, mas descarta eventos definitivamente e usa atividade da PR como se fosse idade do commit. #1863 é a sincronização concreta atual; #1454 descreve falha histórica de geração.
- **Acessibilidade:** #1699 é duplicada de #1715, mas o guard copiado na main ainda esconde auditorias nas rotas sem `<main>`. Encerrar duplicata não elimina esse defeito.
- **Arquivos removidos:** no payload GitHub, o SHA de um arquivo com status `removed` é o blob antigo. Um SHA igual ao da main significa que a remoção ainda não ocorreu, não que o resultado da PR já foi incorporado. `open-prs-main-blob-comparison.json` distingue esses casos.

## 6. Ordem de trabalho recomendada

1. Resolver observabilidade dos gates: main DB vivo, bootstrap DB offline, Sonar e consulta de settings; manter causa técnica explícita.
2. Reconciliar #1863, sua revisão de grants e ledger, sem aprovação automática baseada só em status success.
3. Evitar merge de #1636, #1439, #1430 e #1206 no estado observado; preservar a contribuição útil e corrigir/substituir a proposta.
4. Atualizar registros das candidatas a encerramento #1699 e #1584, carregando o débito a11y herdado. Nenhuma foi fechada nesta auditoria.
5. Organizar a entrega sidebar por contratos, flag, UI e evidência, com revisão das threads já corrigidas mas ainda abertas.
6. Reconciliar issues antigas com correções incorporadas, sem reaplicar migrations nem duplicar tarefas já concluídas.

## 7. Artefatos e rastreabilidade

- `pulls-page-001.raw.json` a `pulls-page-019.raw.json`: respostas brutas preservadas.
- `pulls.normalized.json`: todas as PRs com body e identidade Git.
- `pulls.branch-index.json`: índice compacto para linhagens de branches.
- `issues.normalized.json` e `all-issues-search.raw.json`: todas as issues.
- `open-prs.audit-ledger.json`: resultados completos por PR, checks, contagens e decisão.
- `open-issues.adjudication.json`: decisão das 14 issues.
- `pr-N-files.raw.json`, `pr-N-comments-P.raw.json`, `pr-N-reviews.raw.json`, `pr-N-review-comments.raw.json`, `pr-N-threads.raw.json`: evidência de cada PR aberta.
- `job-ID-logs.raw.json`: logs de falhas inspecionadas; `job-ID-actual-failure-excerpts.txt` preserva os trechos efetivos de erro. Logs contêm testes negativos esperados e comandos ecoados: uma ocorrência textual de ERROR/FALHA não deve ser tratada isoladamente como falha de produto.
- `files-manifest.csv`: tamanho e SHA256 dos artefatos deste diretório.

Nenhuma recomendação acima autoriza merge, exclusão, alteração de configuração ou execução de SQL. São decisões de reconciliação prontas para avaliação do plano.
