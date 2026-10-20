# Auditoria integral de branches e commits exclusivos — 03/10/2026

## Baseline e alcance

A coleção paginada do GitHub confirmou **58 branches**, incluindo `main`, às aproximadamente **22:03 UTC de 03/10/2026** (19:03 em São Paulo). A página 1 devolveu 58; a página 2 devolveu zero. A baseline é [`2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`](https://github.com/adm01-debug/Zapp_Web_V2/commit/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6), commit de **03/10/2026 21:35:59 UTC**. As comparações usam SHAs fixados, não referências móveis.

Foram concluídas **58 comparações remotas**, repetidas no grafo do clone: **zero divergências** de ahead/behind. O único erro transitório da primeira rodada foi resolvido na segunda tentativa. A cobertura de Git é integral para branches atuais, metadados dos commits exclusivos, lista de arquivos e estatísticas dos diffs. A revisão semântica de runtime, banco vivo e UX é uma camada adicional; não é inferida de contagens de commits.

## Resultado consolidado

| Medida | Resultado |
|---|---:|
| Branches incluindo main | 58 |
| Divergentes de main | 51 |
| À frente sem atraso | 3 |
| Ancestrais da main | 3 |
| Idêntica à main | 1 |
| SHAs exclusivos distintos | 197 |
| Commits exclusivos que são merges | 20 |
| Commits não-merge comparados por patch-id | 177 |
| Patches não vazios | 173 |
| Patches vazios | 4 |
| Commits exclusivos com patch equivalente em main | 3 |
| Commits não vazios sem equivalência exata no intervalo | 170 |
| Ocorrências de arquivos nos diffs de branches | 339 |

As 58 referências se dividem em **12 com PR aberta**, **30 cuja última PR foi fechada sem merge**, **7 cuja última PR foi merged mas continuam com commits exclusivos no grafo**, **5 com commits exclusivos e sem PR**, **3 ancestrais da main** e a própria main. O cruzamento percorreu o inventário de **1.828 PRs** fornecido pela frente de PRs; há 126 associações históricas a estas branches. Reutilização da mesma branch por muitas PRs, principalmente `automation/types-sync`, não representa 126 trabalhos ativos.

`ahead > 0` significa que os SHAs não são alcançáveis pela main. Não significa que a funcionalidade esteja ausente: squash, rebase, reescrita e retomada em outra PR mudam os SHAs. `closed` também não significa `merged`.

## Equivalência de conteúdo

Além do grafo, cada caminho do diff foi comparado pelo identificador do blob e modo com a árvore da main fixada:

| Estado do caminho | Ocorrências |
|---|---:|
| Mesmo conteúdo e modo na branch e na main | 60 |
| Conteúdo diferente na main | 197 |
| Existe na branch e está ausente da main | 73 |
| Removido na branch, ainda existe na main | 6 |
| Ausente em ambas | 3 |

Estas são ocorrências por branch, não arquivos únicos. Os 73 caminhos ausentes incluem 25 arquivos do checkpoint documental, planos, módulos de sidebar e arquivos de Team Chat; não são automaticamente resíduos. Os diffs incluem 96 ocorrências de migrations, 105 de aplicação, 45 de documentação, 28 de testes, 20 de guardas/evidências de banco, 17 de edges, 9 de workflows, 7 de scripts e 12 de configuração/outros.

Os 197 commits exclusivos tocaram **1.561 caminhos distintos no diff contra o primeiro pai**. Esse número inclui os 20 merges que sincronizaram a main; ele não mede 1.561 alterações funcionais inéditas.

### Comparação de patches

Foi calculado `git patch-id --stable` para os 177 commits exclusivos não-merge e para **1.110 commits não-merge de main** entre `6d10b094be834aa06facb37d2b293942901a4f81` (merge-base mais antiga entre as branches atuais) e a baseline. Desses 1.110, 1.103 têm patch não vazio. A diferença líquida merge-base→head de todas as 54 branches com ahead também foi comparada; **nenhuma falha de obtenção de objetos restou**.

| Origem exclusiva | Equivalente histórico em main | Interpretação |
|---|---|---|
| `6a0929b09ad4d0510a0345bcaee4ae0baa308aa8` | `3bc1b7915d479f81ac9cd8096550644c9dbef097` | Remoção de arquivos de migrations em slots colididos já tem patch equivalente |
| `79d943340404e81827012c0546fb78ad6381839d` | `c4d7d03d2412ba9d4c1b6a014a5e594bf2dbd897` | Refinamento Talk Me já tem patch equivalente |
| `bc82c0cc45e29b783126e275aded94ece23aae91` | `fc4fad3ea9b80a7332da729df060b15ac2b71d21` | Sincronização de artefatos de banco já tem patch equivalente |

O **diff líquido completo** de `hermes/mapa-f4-p3-observabilidade-2610011830d2a2` equivale ao commit [`e6fdb5d4471edee746d99887dac11b34ee653562`](https://github.com/adm01-debug/Zapp_Web_V2/commit/e6fdb5d4471edee746d99887dac11b34ee653562), merge da **PR #1511**, que retomou E50/E42 da **#1463** fechada. Esta é evidência direta de retomada, mesmo com SHAs de branch exclusivos.

Patches vazios: `1c14e96234c66fcd4adcecf80466a74fcc04e9ff`, `1cdceccb21f0c57f393e2546a5f6af383602c84c`, `69e323c0ca101cde8cc98b08b17ea071429e14ac` e `2ab3c06f96994fcb97d7397ceb46a901d1529b88`.

O patch-id estável ignora whitespace e posição das linhas. Um acerto prova equivalência textual histórica dentro desse método; não prova preservação atual nem correção em produção. Ausência de acerto não prova pendência, porque um squash com mais de um commit ou uma adaptação altera o patch. Os 20 merges não receberam classificação de patch simples.

## Branch crítica: claude/confident-babbage-ivgmmn

HEAD [`0e283d06850a67739beee9cc623530619d9b2cad`](https://github.com/adm01-debug/Zapp_Web_V2/commit/0e283d06850a67739beee9cc623530619d9b2cad), merge-base `0063e2aa76954498ab9344b35f874bca6b18d1d7`: **37 commits à frente, 687 atrás, 87 arquivos no diff**. A PR **#1151 foi fechada sem merge** com head `25b308f2093675373358f86e882454ea73349d92`; o grafo confirma **21 commits depois desse head**. As PRs anteriores #1141, #1119 e #969 foram merged, mas não demonstram integração desses 21 commits posteriores.

Os 87 caminhos se dividem em **12 ausentes de main**, **71 com conteúdo diferente**, **3 removidos na branch mas presentes em main** e **1 ausente em ambas**. Os commits posteriores à #1151 incluem refatoração de hooks/read-state/realtime, header funcional, paginação, busca no servidor, gestão de grupo, transferência, presença, TTS, estatísticas, convites de departamento e notificações globais. Nenhum dos 37 patches individuais tem equivalência exata no intervalo de main auditado.

A branch também contém duas gerações de trabalho de migrations: commits iniciais de DDL e depois um commit que remove 45 migrations descritas como quebradas, seguido de espelhos e novas correções. Isso exige comparar a função atual com a intenção do plano e com as migrations canônicas. Copiar o conteúdo integral da branch para main não é uma reconciliação segura. A frente `code_database_truth` recebeu todos os 87 patches e faz o exame semântico de consumidores, notificação, RLS e RPCs.

## Resíduos e materiais a preservar

**Referências já ancestrais:** `claude/fix-migration-evidence-hash-261029-1400` (0/672), `claude/friendly-mccarthy-g4xd5z` (0/248) e `hermes/tarefas-b4-concluidas-7d-26093006501293` (0/603). Há evidência de que não contêm commits exclusivos. São candidatas documentais a encerramento da referência, sem exclusão executada.

**Cinco branches com ahead e sem PR:** `claude/fix-db-guard-consolidated-260928-1220`, `claude/fix-migration-drift-attest-260928-1600`, `codex/docs-email-navy-plan-100-20261002`, `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` e `docs/plano-ordem-banner-20-etapas-2026-09-30`. As duas primeiras misturam correções antigas de migration/evidência/atestação; em ambas há conteúdo já igual à main e conteúdo diferente. A branch Email contém um plano que existe em versão diferente na main. As duas últimas contêm planos que não existem na main.

Foram preservadas cópias exatas de **quatro planos ausentes da main**, com blob/head/branch/URL no `off-main-plans/manifest.json`: Team Chat conclusão100; Sidebar3seções100; Contatos cabeçalho50; Ordem banner20. Esses 270 identificadores nominais precisam entrar no inventário documental como escopo de branch, evitando descartá-los como lixo ou somá-los automaticamente como tarefas únicas ainda necessárias.

**Outros sinais concretos:** 37 dos 48 caminhos do diff de `hermes/sonar-s7773-number-parseint-2610022025ac4f` já são idênticos à main; 11 diferem. A branch de Telefonia `hermes/telefonia-contrato-dados-26092615475e51` tem 6/20 caminhos idênticos, 13 diferentes e 1 ausente. Esses números impedem tanto declarar tudo inédito quanto apagar tudo como duplicado.

## Inventário completo das 58 branches

`+/-` é ahead/behind contra a baseline. Arquivos/+linhas/-linhas são o diff merge-base→head retornado pelo GitHub. Em PRs: A=aberta, M=merged, F=fechada sem merge. A lista integral com todos os SHAs de PR está em `branches.reconciled.json`.

| Branch | HEAD | +/- commits | Arquivos | +linhas/-linhas | PRs | Classificação |
|---|---|---:|---:|---:|---|---|
| `automation/talkx-status` | `92e6f58449` | +1/-0 | 1 | +2/-2 | [#1713](https://github.com/adm01-debug/Zapp_Web_V2/pull/1713)A | PR aberta; preservar |
| `automation/types-sync` | `a5e0c8070e` | +1/-0 | 4 | +203/-12 | [#1863](https://github.com/adm01-debug/Zapp_Web_V2/pull/1863)A, [#1788](https://github.com/adm01-debug/Zapp_Web_V2/pull/1788)M, [#1690](https://github.com/adm01-debug/Zapp_Web_V2/pull/1690)F, [#1666](https://github.com/adm01-debug/Zapp_Web_V2/pull/1666)M, [#1639](https://github.com/adm01-debug/Zapp_Web_V2/pull/1639)M, [#1513](https://github.com/adm01-debug/Zapp_Web_V2/pull/1513)M, [#1408](https://github.com/adm01-debug/Zapp_Web_V2/pull/1408)M, [#1343](https://github.com/adm01-debug/Zapp_Web_V2/pull/1343)M, +62 históricas no JSON | PR aberta; preservar |
| `claude/chore-reconcilia-db-live-guard-260926-2040` | `a687d0d1ee` | +2/-1335 | 2 | +7/-0 | [#911](https://github.com/adm01-debug/Zapp_Web_V2/pull/911)F | Última PR fechada sem merge; reconciliar |
| `claude/chore-supersede-duplicate-fk-indexes-260927-0100` | `e778f8d8f6` | +1/-1307 | 2 | +31/-0 | [#939](https://github.com/adm01-debug/Zapp_Web_V2/pull/939)F | Última PR fechada sem merge; reconciliar |
| `claude/confident-babbage-ivgmmn` | `0e283d0685` | +37/-687 | 87 | +3488/-1233 | [#1151](https://github.com/adm01-debug/Zapp_Web_V2/pull/1151)F, [#1141](https://github.com/adm01-debug/Zapp_Web_V2/pull/1141)M, [#1119](https://github.com/adm01-debug/Zapp_Web_V2/pull/1119)M, [#969](https://github.com/adm01-debug/Zapp_Web_V2/pull/969)M | Última PR fechada sem merge; reconciliar |
| `claude/feat-e50-db-guard-261002-1905` | `4991c6141d` | +2/-273 | 2 | +17/-6 | [#1588](https://github.com/adm01-debug/Zapp_Web_V2/pull/1588)F | Última PR fechada sem merge; reconciliar |
| `claude/feat-sidebar-contato-3-secoes-261002-1510` | `74783271e8` | +1/-238 | 1 | +356/-0 | [#1621](https://github.com/adm01-debug/Zapp_Web_V2/pull/1621)A | PR aberta; preservar |
| `claude/fix-540000-agent-stats-260928-1230` | `7d5f8e8041` | +2/-771 | 2 | +4/-4 | [#1099](https://github.com/adm01-debug/Zapp_Web_V2/pull/1099)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-540000-doc-agent-stats-260928-1046` | `dfcd658498` | +1/-779 | 2 | +3/-3 | [#1086](https://github.com/adm01-debug/Zapp_Web_V2/pull/1086)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-attestation-e09-stable-inv-291029-1520` | `ea107e527c` | +7/-479 | 1 | +12/-6 | [#1206](https://github.com/adm01-debug/Zapp_Web_V2/pull/1206)A | PR aberta; preservar |
| `claude/fix-attestation-timeout-260928-1630` | `8090789a19` | +1/-804 | 1 | +5/-10 | [#1076](https://github.com/adm01-debug/Zapp_Web_V2/pull/1076)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-ci-banned-actions-261002-1430` | `e4143de7d0` | +4/-249 | 2 | +93/-22 | [#1610](https://github.com/adm01-debug/Zapp_Web_V2/pull/1610)A | PR aberta; preservar |
| `claude/fix-ci-types-sync-husky-e2e-260927-1245` | `297465e4fb` | +1/-1270 | 2 | +23/-6 | [#973](https://github.com/adm01-debug/Zapp_Web_V2/pull/973)M | Última PR merged; grafo ainda exclusivo |
| `claude/fix-codeql-stack-trace-270927-2200` | `7c9c9b52d9` | +3/-893 | 6 | +101/-88 | [#1064](https://github.com/adm01-debug/Zapp_Web_V2/pull/1064)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-db-gaps-guards-closures-null-260927-1731` | `3b39fba4bd` | +5/-966 | 1 | +137/-0 | [#1022](https://github.com/adm01-debug/Zapp_Web_V2/pull/1022)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-db-guard-consolidated-260928-1220` | `63ca4d4636` | +1/-773 | 5 | +730/-163 | — | Sem PR; preservar e reconciliar |
| `claude/fix-db-ledger-parity-260927-1900` | `7955f2b811` | +3/-961 | 11 | +221/-16 | [#1045](https://github.com/adm01-debug/Zapp_Web_V2/pull/1045)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-db-live-guard-260928-0930` | `a1d99e87d9` | +14/-804 | 6 | +308/-508 | [#1077](https://github.com/adm01-debug/Zapp_Web_V2/pull/1077)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-db-live-guard-drift-260928-1045` | `69e323c0ca` | +11/-796 | 7 | +3474/-3605 | [#1094](https://github.com/adm01-debug/Zapp_Web_V2/pull/1094)F, [#1081](https://github.com/adm01-debug/Zapp_Web_V2/pull/1081)M, [#1073](https://github.com/adm01-debug/Zapp_Web_V2/pull/1073)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-db-live-guard-missing-migrations-270927-1730` | `1c14e96234` | +2/-989 | 3 | +210/-0 | [#1026](https://github.com/adm01-debug/Zapp_Web_V2/pull/1026)M | Última PR merged; grafo ainda exclusivo |
| `claude/fix-db-security-execute-public-search-path-260927-1730` | `e37f2688a6` | +5/-965 | 1 | +88/-0 | [#1021](https://github.com/adm01-debug/Zapp_Web_V2/pull/1021)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-e09-e2e-fixme-261001-1740` | `82a9cc5efe` | +1/-430 | 3 | +9/-1 | [#1430](https://github.com/adm01-debug/Zapp_Web_V2/pull/1430)A | PR aberta; preservar |
| `claude/fix-e27-e17-e18-261001-1805` | `3323533e8c` | +1/-421 | 1 | +49/-1 | [#1439](https://github.com/adm01-debug/Zapp_Web_V2/pull/1439)A | PR aberta; preservar |
| `claude/fix-e50-db-guard-261002-1256` | `4d8390d779` | +2/-268 | 2 | +13/-3 | [#1592](https://github.com/adm01-debug/Zapp_Web_V2/pull/1592)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-gamification-guard-xp-cap-270927-1750` | `539bb3f7f2` | +1/-1013 | 1 | +6/-0 | [#1009](https://github.com/adm01-debug/Zapp_Web_V2/pull/1009)M | Última PR merged; grafo ainda exclusivo |
| `claude/fix-known-violations-kick-261002-1240` | `33f0426820` | +1/-273 | 1 | +3/-4 | [#1584](https://github.com/adm01-debug/Zapp_Web_V2/pull/1584)A | PR aberta; preservar |
| `claude/fix-migration-drift-270926-0121` | `4f2062ce6b` | +1/-1306 | 1 | +59/-0 | [#947](https://github.com/adm01-debug/Zapp_Web_V2/pull/947)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-migration-drift-attest-260928-1600` | `c4679080a3` | +1/-804 | 4 | +304/-10 | — | Sem PR; preservar e reconciliar |
| `claude/fix-migration-evidence-hash-261029-1400` | `e433589f87` | +0/-672 | 0 | +0/-0 | — | Ancestral da main; candidata a encerrar a referência |
| `claude/fix-migration-parity-270927-1742` | `c80bcf18d4` | +4/-995 | 4 | +38/-499 | [#1017](https://github.com/adm01-debug/Zapp_Web_V2/pull/1017)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-migration-version-collision-300000-270927-1400` | `656d7d7769` | +2/-1221 | 1 | +1/-1 | [#981](https://github.com/adm01-debug/Zapp_Web_V2/pull/981)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-missing-migrations-260928-2200` | `4bd7d085f3` | +1/-687 | 8 | +569/-1131 | [#1150](https://github.com/adm01-debug/Zapp_Web_V2/pull/1150)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-multiplix-send-auth-270927-1530` | `fbb71c3556` | +1/-960 | 2 | +154/-4 | [#1020](https://github.com/adm01-debug/Zapp_Web_V2/pull/1020)M | Última PR merged; grafo ainda exclusivo |
| `claude/fix-rls-contacts-version-collision-260927-0046` | `39e61d43da` | +1/-1308 | 1 | +13/-0 | [#938](https://github.com/adm01-debug/Zapp_Web_V2/pull/938)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-types-gate1-280928-2100` | `1e5f9397d0` | +1/-693 | 2 | +8/-3 | [#1142](https://github.com/adm01-debug/Zapp_Web_V2/pull/1142)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-types-gate1-created-by-280928-2230` | `c908fcb9d7` | +1/-687 | 2 | +13/-22 | [#1153](https://github.com/adm01-debug/Zapp_Web_V2/pull/1153)F, [#1149](https://github.com/adm01-debug/Zapp_Web_V2/pull/1149)F | Última PR fechada sem merge; reconciliar |
| `claude/fix-types-sync-husky-270927-1306` | `601cbbf1ed` | +2/-1270 | 2 | +9/-1 | [#976](https://github.com/adm01-debug/Zapp_Web_V2/pull/976)F | Última PR fechada sem merge; reconciliar |
| `claude/friendly-mccarthy-g4xd5z` | `d8afe4cb75` | +0/-248 | 0 | +0/-0 | [#1603](https://github.com/adm01-debug/Zapp_Web_V2/pull/1603)M | Ancestral da main; candidata a encerrar a referência |
| `claude/resolve-conflicting-prs-afl1fp` | `d898cd08bd` | +1/-1306 | 2 | +181/-1 | [#942](https://github.com/adm01-debug/Zapp_Web_V2/pull/942)F | Última PR fechada sem merge; reconciliar |
| `codex/docs-email-navy-plan-100-20261002` | `f0e46def16` | +1/-176 | 1 | +908/-0 | — | Sem PR; preservar e reconciliar |
| `codex/talk-me-carousel-refinement-20260930` | `2ab3c06f96` | +4/-497 | 5 | +1038/-106 | [#1351](https://github.com/adm01-debug/Zapp_Web_V2/pull/1351)F | Última PR fechada sem merge; reconciliar |
| `devin/1764000000-crm-sidebar-lookup` | `e7917922b8` | +6/-28 | 5 | +236/-34 | [#1636](https://github.com/adm01-debug/Zapp_Web_V2/pull/1636)A | PR aberta; preservar |
| `devin/1764000200-sidebar-3-secoes` | `82c5fd6c70` | +11/-28 | 30 | +1974/-311 | [#1654](https://github.com/adm01-debug/Zapp_Web_V2/pull/1654)A | PR aberta; preservar |
| `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` | `9da991a72b` | +1/-590 | 1 | +688/-0 | — | Sem PR; preservar e reconciliar |
| `docs/plano-ordem-banner-20-etapas-2026-09-30` | `7e37c3008f` | +1/-596 | 1 | +369/-0 | — | Sem PR; preservar e reconciliar |
| `docs/plano-talk-me-100-etapas` | `ca55e90937` | +1/-548 | 1 | +529/-0 | [#1301](https://github.com/adm01-debug/Zapp_Web_V2/pull/1301)F | Última PR fechada sem merge; reconciliar |
| `docs/reconciliation-checkpoint-20261003` | `a2d9f62d5a` | +25/-0 | 25 | +1383/-0 | [#1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869)A | PR aberta; preservar |
| `hermes/a11y-aria-hidden-focus-2610021746e07a` | `139811c3e5` | +1/-165 | 1 | +7/-0 | [#1699](https://github.com/adm01-debug/Zapp_Web_V2/pull/1699)A | PR aberta; preservar |
| `hermes/acl-default-privileges-revoke-anon-2609300840a808` | `023c5def9e` | +1/-583 | 3 | +36/-0 | [#1255](https://github.com/adm01-debug/Zapp_Web_V2/pull/1255)M | Última PR merged; grafo ainda exclusivo |
| `hermes/l5-followup-contrato-e-jobs-261001070612ac` | `c45e8f6b61` | +1/-482 | 2 | +257/-72 | [#1368](https://github.com/adm01-debug/Zapp_Web_V2/pull/1368)M | Última PR merged; grafo ainda exclusivo |
| `hermes/mapa-f4-p3-observabilidade-2610011830d2a2` | `7bcb503ee8` | +2/-393 | 3 | +34/-2 | [#1463](https://github.com/adm01-debug/Zapp_Web_V2/pull/1463)F | Última PR fechada sem merge; reconciliar |
| `hermes/plano-volume-50-etapas-finalizacao-2610011018e48d` | `3df3fc2d9f` | +1/-449 | 2 | +30/-16 | [#1395](https://github.com/adm01-debug/Zapp_Web_V2/pull/1395)M | Última PR merged; grafo ainda exclusivo |
| `hermes/sonar-s7773-number-parseint-2610022025ac4f` | `297fe9d4b8` | +5/-137 | 48 | +418/-115 | [#1730](https://github.com/adm01-debug/Zapp_Web_V2/pull/1730)F | Última PR fechada sem merge; reconciliar |
| `hermes/talkx-v06-replay-26093016291fca` | `f01188c9ef` | +1/-512 | 4 | +94/-1 | [#1333](https://github.com/adm01-debug/Zapp_Web_V2/pull/1333)F | Última PR fechada sem merge; reconciliar |
| `hermes/tarefas-b4-concluidas-7d-26093006501293` | `89813af047` | +0/-603 | 0 | +0/-0 | [#1235](https://github.com/adm01-debug/Zapp_Web_V2/pull/1235)M | Ancestral da main; candidata a encerrar a referência |
| `hermes/telefonia-contrato-dados-26092615475e51` | `4c41d3b1a3` | +6/-1354 | 20 | +4688/-0 | [#875](https://github.com/adm01-debug/Zapp_Web_V2/pull/875)F | Última PR fechada sem merge; reconciliar |
| `hermes/v06-replay-safe-autorizado-2610021151ca8d` | `0470a373c7` | +2/-235 | 1 | +3/-1 | [#1624](https://github.com/adm01-debug/Zapp_Web_V2/pull/1624)F | Última PR fechada sem merge; reconciliar |
| `main` | `2e7cf81c6c` | +0/-0 | 0 | +0/-0 | — | Baseline fixada |

## Evidência e limites

- `branches.raw.json` e `branches-page-2.raw.json`: coleção completa paginada.
- `main.raw.json`: metadados da baseline remota.
- `branch-comparisons.json`: 58 respostas normalizadas da comparação remota, inclusive estatísticas por arquivo.
- `branches.reconciled.json` e `.csv`: branches, PRs, classificação de grafo, blobs atuais e patches.
- `exclusive-commits.json` e `EXCLUSIVE_COMMITS_197.md`: todos os 197 commits, pais, datas, assuntos, corpos, caminhos e categoria de equivalência.
- `patch-equivalence.json`, `main-patch-ids.json` e `patch-candidates.json`: método, intervalo e hashes reproduzíveis.
- `confident-babbage.compare.raw.json`: 37 commits e os 87 patches brutos do caso crítico.
- `off-main-plans/manifest.json`: quatro planos de branch que faltavam no inventário limitado à main.

Nenhuma branch foi apagada, nenhum commit foi criado nesta frente, nenhuma PR foi modificada e nenhum banco/serviço de produção foi executado. O clone e seus objetos históricos foram usados para leitura. A lista representa a fotografia de 03/10; refs futuras exigem nova coleta. Leitura semântica integral de todos os commits históricos do repositório não é alegada por este relatório.

