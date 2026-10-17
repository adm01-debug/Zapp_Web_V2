# F05 - roteiro de resgate: hooks, lib e services (dia x origin/main)

Base: dia/2026-10-17 @ d723a90107 x origin/main @ a9b4d6c6fb; merge-base 7a15852791.
Fonte do mapa: c30ac98b7d - `docs/plans/sync/F05-F08-front-docs-raiz-mapa-2026-10-17.md`
e `docs/plans/sync/dados/f05_plano_prs.csv`.
Este documento NAO traz codigo de resgate: e o roteiro (ordem, dependencias e remocoes) da
trilha de hooks/lib/services, para o cartao do complexo (SYNC20-21) executar e para servir de
guia na hora de resolver conflito por area.

## 1. Escopo medido

Fatos medidos agora por `git diff --name-only --diff-filter=A|D HEAD origin/main` e conferidos
contra o somatorio do CSV do mapa:

| subarea | origin-only (aditivo) | blobs diferentes | HEAD-only (removido na origin) |
|---|---|---|---|
| hooks | 131 | 190 | 8 |
| lib | 30 | 20 | 0 |
| services | 3 | 12 | 0 |

O somatorio do CSV fecha com o diff arquivo a arquivo: 131 = PR44..PR56; 190 = PR57..PR65;
30 = PR66+PR67; 20 = PR68; 3 = PR71; 12 = PR72.

**Slice desta trilha = 27 PRs** (nao 14). O "14" citado antes no cartao contava so parte dos
aditivos de hooks; a fonte e o CSV: 13 aditivos de hooks (PR44..PR56), 9 de blob de hooks
(PR57..PR65), 3 de lib (PR66..PR68), 2 de services (PR71..PR72).

## 2. Os 27 PRs (numeracao do mapa)

| PR | subarea | tipo | arquivos | linhas | origem provavel |
|---|---|---|---|---|---|
| PR44 | hooks | origin_only | 10 | 1383 | lote 025d0258dc + fixes F1-F6 |
| PR45 | hooks | origin_only | 8 | 1464 | lote 025d0258dc + fixes F1-F6 |
| PR46 | hooks | origin_only | 11 | 1469 | lote 025d0258dc + fixes F1-F6 |
| PR47 | hooks | origin_only | 9 | 1409 | lote 025d0258dc + fixes F1-F6 |
| PR48 | hooks | origin_only | 10 | 1428 | lote 025d0258dc + fixes F1-F6 |
| PR49 | hooks | origin_only | 8 | 1418 | lote 025d0258dc + fixes F1-F6 |
| PR50 | hooks | origin_only | 7 | 1383 | lote 025d0258dc + fixes F1-F6 |
| PR51 | hooks | origin_only | 10 | 1455 | lote 025d0258dc + fixes F1-F6 |
| PR52 | hooks | origin_only | 9 | 1363 | lote 025d0258dc + fixes F1-F6 |
| PR53 | hooks | origin_only | 10 | 1402 | lote 025d0258dc + fixes F1-F6 |
| PR54 | hooks | origin_only | 13 | 1422 | lote 025d0258dc + fixes F1-F6 |
| PR55 | hooks | origin_only | 14 | 1455 | lote 025d0258dc + fixes F1-F6 |
| PR56 | hooks | origin_only | 12 | 1149 | lote 025d0258dc + fixes F1-F6 |
| PR57 | hooks | blob_diferente | 30 | 1442 | 15494eecc5 / 99aa354f5e |
| PR58 | hooks | blob_diferente | 21 | 1316 | 99aa354f5e / b44540e359 |
| PR59 | hooks | blob_diferente | 28 | 1356 | 01b753e7dd / 025d0258dc / 15494eecc5 |
| PR60 | hooks | blob_diferente | 25 | 1300 | 025d0258dc / ecfdb26ffd |
| PR61 | hooks | blob_diferente | 20 | 1430 | 15494eecc5 / ecfdb26ffd |
| PR62 | hooks | blob_diferente | 22 | 1436 | 025d0258dc / ecfdb26ffd |
| PR63 | hooks | blob_diferente | 8 | 1426 | 025d0258dc / ecfdb26ffd |
| PR64 | hooks | blob_diferente | 26 | 1491 | 025d0258dc / 99aa354f5e |
| PR65 | hooks | blob_diferente | 10 | 461 | origin/main |
| PR66 | lib | origin_only | 17 | 1358 | lote 025d0258dc + fixes F1-F6 |
| PR67 | lib | origin_only | 13 | 1170 | lote 025d0258dc + fixes F1-F6 |
| PR68 | lib | blob_diferente | 20 | 1046 | 025d0258dc / 15494eecc5 |
| PR71 | services | origin_only | 3 | 211 | lote 025d0258dc + fixes F1-F6 |
| PR72 | services | blob_diferente | 12 | 720 | origin/main |

Maior PR do slice: 30 arquivos / 1491 linhas (limite do mapa: 30 / 1500). Nenhum PR deste
slice precisa ser furado, mas PR57 e PR64 estao no teto: ao remanejar, nao acrescente arquivo.

## 3. Ordem de aplicacao (cumulativa) e dependencias

Ordem numerica do mapa NAO e ordem de aplicacao. A ordem correta, do geral para o dependente:

1. **components PR01..PR43** (fora deste slice, mas primeiro) - os hooks do lote importam
   componentes e o InboxFilters/CampaignsView do dia vivem ali.
2. **hooks aditivos PR44..PR56** - mesma origem (lote 025d0258dc + fixes F1-F6); trazem o
   hooks novo que os componentes passam a importar.
3. **hooks blob PR57..PR65** - versao da origin dos hooks que ja existem no dia; nao
   sobrepoem arquivo com os aditivos (um arquivo e ou aditivo ou blob).
4. **lib blob PR68 ANTES dos aditivos PR66/PR67** (dependencia lib -> PR68): o
   `realtimeTopic`/realtime da origin muda o contrato que os arquivos aditivos de lib usam.
5. **lib aditivos PR66..PR67**.
6. **services blob PR72 ANTES do aditivo PR71** (dependencia services -> PR72): PR72 e a versao
   da origin de `inbox.service.ts` e dos contratos que o arquivo aditivo de PR71 chama.
7. **services aditivo PR71**.

Regra de ouro do slice: **aditivo de hooks depende de components (PR01..PR43); aditivo de lib
depende de PR68; aditivo de services depende de PR72.** Fora desta trilha, seguir a numeracao
do mapa para pages (PR69..PR70) e o resto (PR73..PR86).

## 4. Onde os obsoletos sao removidos (junto da implementacao nova)

Os 8 HEAD-only de hooks foram removidos na origin pelo MESMO lote que traz a implementacao
nova: `025d0258dc` (lote 880 cartoes). Remover e trazer a versao da origin tem de ser o mesmo
passo - apagar antes de aplicar o aditivo deixa o dia sem compilar.

| arquivo obsoleto no dia | veredito | quem o importa no dia (medido) |
|---|---|---|
| src/hooks/system/useVersions.ts | obsoleto | ninguem fora de src/hooks |
| src/hooks/__tests__/useVersions.test.tsx | obsoleto (teste do removido) | - |
| src/hooks/inbox/useInboxFilterTags.ts | obsoleto | src/components/inbox/InboxFilters.tsx, src/components/inbox/__tests__/InboxFilters.nomes-seletores.test.tsx, src/services/inbox.service.ts, src/services/__tests__/inbox.service.test.ts |
| src/hooks/inbox/__tests__/useInboxFilterTags.camada-servico.test.tsx | obsoleto | - |
| src/hooks/inbox/__tests__/useInboxFilterTags.paginacao.test.tsx | obsoleto | - |
| src/hooks/communication/useCampaigns.ts | obsoleto | src/components/campaigns/CampaignsView.tsx (+4 testes), todos HEAD-only do mesmo lote |
| src/hooks/__tests__/useCampaigns.test.tsx | obsoleto | - |
| src/hooks/__tests__/useMessageStatus.test.tsx | obsoleto | src/lib/__tests__/realtimeTopic.canais-fixos.test.tsx |

Consequencias para a ordem:
- Remover `useInboxFilterTags` sem PR44..PR56 + PR01..PR43 aplicados deixa orfaos
  `InboxFilters.tsx` e `services/inbox.service.ts` -> a remocao anda junto do aditivo.
- Remover `useCampaigns` so faz sentido com os componentes de campanha classica fora
  (src/components/campaigns/** do dia sao todos HEAD-only obsoletos).
- `useMessageStatus` e citado por `src/lib/__tests__/realtimeTopic.canais-fixos.test.tsx`, que
  tambem muda na origin (PR68) -> remover o teste velho junto de PR68.

A origin mantem guardas de remocao que FALHAM se o arquivo voltar: conferido agora,
`git cat-file -e origin/main:src/hooks/system/__tests__/useVersionsAusente.test.ts` existe.
lib e services nao tem HEAD-only: nada a remover nessas duas subareas.

## 5. Medicao de testes da tentativa 1 (registrada no cartao; NAO remedida aqui)

Na tentativa 1 (17/10) a arvore de resgate foi montada e medida: **71 de 90 arquivos de teste
vermelhos, 308 testes falhando**, com 3 causas nomeadas (dependencia de componentes do lote
025d0258dc ainda ausente, contrato de servico da origin, contrato de realtime/lib). Nos cortes
por area: services 11 falhas, lib 4 falhas. Esses numeros vem daquele log, nao de uma execucao
deste cartao (que nao roda codigo de resgate) - use-os como estimativa de risco ao planejar o
tamanho do PR, nao como medicao atual.

## 6. Limites deste cartao

- Nenhum arquivo de codigo de resgate entrou aqui: so este roteiro (leitura + contagem).
- Sem push, sem merge, sem PR aberto (Etapa 046 proibe merge direto dia -> main).
- types/** e da F12 (PR76) - fora desta trilha.
- e2e intocado; nenhuma execucao autenticada, sem `.auth/*`, sem banco de producao (R1).
