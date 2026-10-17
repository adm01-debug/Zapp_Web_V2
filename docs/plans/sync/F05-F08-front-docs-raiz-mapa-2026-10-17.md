# F05 + F08 - front (src/), docs, e2e, tests e raiz: mapa de reconciliacao

Base: HEAD = dia/2026-10-17 @ d723a90107 x origin/main @ a9b4d6c6fb; merge-base 7a15852791.
Leitura pura: nenhum arquivo de codigo foi alterado. Resumo e scripts em `docs/plans/sync/dados/`.
O dado linha-a-linha dos 1157 arquivos esta em 3 CSV maiores (`src_diferentes.csv`,
`src_origin_only.csv`, `f05_origin_only_proveniencia.csv`), que ficam em `.tmp/sync/` do workspace
`v2/sync-ag2-front-26101708550eb1` - fora do commit pelo limite de tamanho do fechar. Os scripts
regeram tudo a partir de `git ls-tree`/`git log`, sem estado externo.

## 1. src/ por subarea

| subarea | arquivos no dia | arquivos na origin | origin-only | HEAD-only | blobs diferentes |
|---|---|---|---|---|---|
| __tests__ | 8 | 11 | 3 | 0 | 2 |
| adapters | 5 | 5 | 0 | 0 | 3 |
| assets | 18 | 18 | 0 | 0 | 0 |
| components | 1879 | 2100 | 246 | 25 | 477 |
| config | 3 | 3 | 0 | 0 | 0 |
| contexts | 2 | 2 | 0 | 0 | 0 |
| data | 1 | 1 | 0 | 0 | 0 |
| features | 6 | 6 | 0 | 0 | 5 |
| hooks | 783 | 906 | 131 | 8 | 190 |
| i18n | 2 | 2 | 0 | 0 | 1 |
| integrations | 4 | 4 | 0 | 0 | 1 |
| lib | 252 | 282 | 30 | 0 | 20 |
| pages | 62 | 70 | 8 | 0 | 12 |
| providers | 7 | 9 | 2 | 0 | 1 |
| routes | 2 | 2 | 0 | 0 | 0 |
| segments | 0 | 2 | 2 | 0 | 0 |
| services | 31 | 34 | 3 | 0 | 12 |
| styles | 19 | 19 | 0 | 0 | 1 |
| test | 10 | 11 | 1 | 0 | 0 |
| types | 13 | 13 | 0 | 0 | 2 |
| utils | 15 | 15 | 0 | 0 | 3 |

Total: 426 origin-only, 33 HEAD-only, 731 blobs diferentes.

## 2. HEAD-only (Etapa 053): 33/33 obsoletos - nao replayar

| caminho | ultima alteracao no dia | removido na origin por | veredito |
|---|---|---|---|
| src/components/campaigns/CampaignABTesting.tsx | 2026-10-11 16:18 | 025d0258dc | obsoleto |
| src/components/campaigns/CampaignCreateDialog.tsx | 2026-10-08 01:48 | 025d0258dc | obsoleto |
| src/components/campaigns/CampaignsView.tsx | 2026-10-11 16:18 | 025d0258dc | obsoleto |
| src/components/campaigns/__tests__/CampaignABTesting.a11y.test.tsx | 2026-10-11 16:18 |  | obsoleto_teste_de_codigo_removido |
| src/components/campaigns/__tests__/CampaignCreateDialog.r2-mod-005.test.tsx | 2026-10-08 01:48 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/campaigns/__tests__/CampaignsView.a11y-progress.test.tsx | 2026-10-11 16:18 |  | obsoleto_teste_de_codigo_removido |
| src/components/campaigns/__tests__/CampaignsView.audiencia.r2-mod-005.test.tsx | 2026-10-08 01:48 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/campaigns/__tests__/CampaignsView.retomada.test.tsx | 2026-10-07 20:50 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/campaigns/__tests__/CampaignsView.test.tsx |  | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/inbox/QueuePositionNotifier.tsx |  | 025d0258dc | obsoleto |
| src/components/inbox/SwipeableListItem.tsx |  | 025d0258dc | obsoleto |
| src/components/inbox/__tests__/swipeActions.test.ts | 2026-10-14 11:59 |  | obsoleto |
| src/components/inbox/swipeActions.ts |  | 025d0258dc | obsoleto |
| src/components/security/__tests__/AuditLogDashboard.hoje-local.test.tsx |  | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/settings/AIAutoTagsConfig.tsx | 2026-10-09 12:24 | 025d0258dc | obsoleto |
| src/components/settings/__tests__/AIAutoTagsConfig.recentesErro.test.tsx | 2026-10-09 12:24 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/components/ui/hover-card.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/menubar.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/pagination.tsx | 2026-10-14 13:30 | 025d0258dc | obsoleto |
| src/components/ui/resizable.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/sidebar.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/sidebar/index.ts |  | 025d0258dc | obsoleto |
| src/components/ui/sidebar/sidebar-context.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/sidebar/sidebar-menu.tsx |  | 025d0258dc | obsoleto |
| src/components/ui/sidebar/sidebar-primitives.tsx | 2026-10-14 13:30 | 025d0258dc | obsoleto |
| src/hooks/__tests__/useCampaigns.test.tsx |  | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/hooks/__tests__/useMessageStatus.test.tsx |  | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/hooks/__tests__/useVersions.test.tsx |  | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/hooks/communication/useCampaigns.ts |  | 025d0258dc | obsoleto |
| src/hooks/inbox/__tests__/useInboxFilterTags.camada-servico.test.tsx | 2026-10-09 12:24 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/hooks/inbox/__tests__/useInboxFilterTags.paginacao.test.tsx | 2026-10-06 00:17 | 025d0258dc | obsoleto_teste_de_codigo_removido |
| src/hooks/inbox/useInboxFilterTags.ts | 2026-10-09 12:24 | 025d0258dc | obsoleto |
| src/hooks/system/useVersions.ts |  | 025d0258dc | obsoleto |

32 foram removidos pela origin no commit 025d0258dc (lote 880 cartoes), que traz implementacao nova
no lugar. A origin mantem testes-guarda de remocao que FALHAM se o arquivo voltar
(`src/hooks/system/__tests__/useVersionsAusente.test.ts`, `src/components/inbox/__tests__/queue-position-removido.test.ts`).
O 33o (`src/components/inbox/__tests__/swipeActions.test.ts`) testa modulo que a origin removeu
(`git grep -F swipeActions origin/main -- src` = 0).

## 3. Blobs diferentes (Etapa 054): 731, vencedor = origin/main

Criterio: recencia (ultimo commit de cada lado) - nunca tamanho. 578 com a origin mais nova no
intervalo; 153 em que o dia nao tem commit posterior a base, logo a unica mudanca e a da origin.
Amostra de 25 conferida com `git log -1 --format=%ct` nos dois lados: 25/25 com a origin mais nova.

| subarea | blobs diferentes |
|---|---|
| App.tsx | 1 |
| __tests__ | 2 |
| adapters | 3 |
| components | 477 |
| features | 5 |
| hooks | 190 |
| i18n | 1 |
| integrations | 1 |
| lib | 20 |
| pages | 12 |
| providers | 1 |
| services | 12 |
| styles | 1 |
| types | 2 |
| utils | 3 |

## 4. Plano de PRs pequenos (Etapa 055) - planejar, nao abrir

Arquivo completo: `f05_plano_prs.csv`. Total de PRs: 86; maior PR: 30 arquivos e 1491 linhas (limite 30/1500).
Tipos: 47 de replay aditivo (origin-only) e 39 de replay da versao da origin.
`src/types/**` fica FORA desta trilha (types.ts e da F12).

| PR | subarea | tipo | arquivos | linhas | origem provavel |
|---|---|---|---|---|---|
| PR01 | components | origin_only | 9 | 1477 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |
| PR02 | components | origin_only | 10 | 1395 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |
| PR03 | components | origin_only | 13 | 1423 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |
| PR04 | components | origin_only | 11 | 1298 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |
| PR05 | components | origin_only | 12 | 1421 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |
| PR06 | components | origin_only | 10 | 1396 | 025d0258dc lote 880 cartões + fixes F1-F6 (completo, compila) |

## 5. F08 - docs, e2e, tests, .tmp e raiz

| area | arquivos no dia | arquivos na origin |
|---|---|---|
| src | 3126 | 3519 |
| tests/contracts | 90 | 95 |
| docs | 1474 | 1515 |
| e2e | 113 | 118 |
| docs/plans | 55 | 56 |
| supabase/functions | 360 | 383 |

Classes por area: docs 41 origin-only e 22 diferentes; e2e 5/7; tests 6/5; .tmp 10/2.
`tests/contracts`: 90 no dia x 95 na origin. `tests/axe-campaigns.contract.test.ts` e HEAD-only e
obsoleto (campanha classica removida na origin, que ja tem `no-campaigns-classicas.contract.test.ts`).

Raiz divergente:

| arquivo | classe | linhas dia | linhas origin | diff |
|---|---|---|---|---|
| bun.lock | diferente | 1653 | 1653 | 1 file changed, 144 insertions(+), 144 deletions(-) |
| .env.production | diferente | 25 | 25 | 1 file changed, 1 insertion(+), 1 deletion(-) |
| .gitignore | diferente | 129 | 130 | 1 file changed, 1 insertion(+) |
| FEATURE_REGISTRY.md | diferente | 87 | 86 | 1 file changed, 3 insertions(+), 4 deletions(-) |
| ESTADO.md | diferente | 158 | 163 | 1 file changed, 10 insertions(+), 5 deletions(-) |
| CONTRIBUTING.md | diferente | 178 | 112 | 1 file changed, 68 insertions(+), 134 deletions(-) |

`.env.production`: a divergencia e de 1 linha e os NOMES das 9 variaveis sao identicos nos dois lados
(`f08_env_nomes.csv`); nenhum valor foi lido ou registrado.

## 6. Limites e ressalvas

- 417 dos 426 origin-only de src vieram de UM commit de lote (025d0258dc, PR #1976): a atribuicao por
  branch v2/* nao existe localmente para eles (Etapa 059 exige o corpo dos PRs do lote).
- Nao abri PR, nao fiz push/merge (Etapa 046 proibe merge direto dia -> main).
- Nao apaguei planos antigos nem tirei o .tmp do versionamento (Etapas 082/088, PR proprio).
- e2e intocado: nenhuma execucao autenticada, sem .auth/*, sem banco de producao (R1).
