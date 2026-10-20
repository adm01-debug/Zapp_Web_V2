- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 225s;OK lint 10s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 15:12, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  39 ++---
 src/components/talkx/TalkXSegments.tsx             | 184 +++++++++++++++------
 .../__tests__/TalkXSegments.viewMode.test.tsx      | 108 ++++++++++++
 src/hooks/integrations/useTalkXSegments.ts         |   8 +
 4 files changed, 265 insertions(+), 74 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 2 passed (2)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — Jev inseguro sobre o relato

Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/hooks/integrations/useTalkXSegments.ts`: novo `viewMode: 'list' | 'grid'` + `setViewMode` no hook (`useState`, padrão `'list'`); tipo `TalkXSegmentsViewMode` exportado. Estado local porque o projeto não persiste modo (Contatos, em `useContactsViewState`, também é estado local).
- `src/components/talkx/TalkXSegments.tsx`: botões lista/grade (`data-testid` `segments-view-list` / `segments-view-grid`, `aria-pressed` acompanhando) no `rightSlot` da `FilterBarV2`, ao lado de "Novo segmento"; o miolo da biblioteca troca SÓ o contêiner — `data-testid="segments-list"` (`flex flex-col`, uma coluna) ou `data-testid="segments-grid"` (`grid sm:grid-cols-2 xl:grid-cols-3`) — e renderiza o MESMO `SegmentCard` (`data-testid="segment-card"`) nos dois modos. O `SegmentCard` foi extraído da linha da tabela antiga sem perder nada do que ela mostrava: estrela de favorito, nome, descrição, origem, status, chips de critério (com "+N" e "Toda a base"), público estimado, último uso, barra de "Público relativo" e o menu de ações (ver detalhes, usar em campanha, editar, favoritar, excluir). O teto da barra continua o maior `estimated_count` entre os segmentos carregados, agora num `useMemo`.
- `src/components/talkx/__tests__/TalkXSegments.viewMode.test.tsx`: teste novo — renderiza o `TalkXSegments` REAL com o hook REAL (só a rede é mockada), prova que abre em lista, que o clique em grade troca o contêiner, que os mesmos 2 cartões permanecem (nenhuma árvore visual duplicada), que o `aria-pressed` acompanha, que volta para a lista, e que o cartão mantém origem, status, público e "Toda a base".

## Critério de pronto
1. Alternância lista/grade funciona — `TalkXSegments.tsx` (botões + contêiner `segments-list`/`segments-grid`), provado no teste novo (2 casos).
   Reuso: o cartão NÃO foi criado como segunda árvore — é um só `SegmentCard` usado pelos dois modos (contêiner muda). Ver "O que NÃO fiz".
2. Preferência de modo — `useTalkXSegments.ts` (`viewMode`/`setViewMode`), consumida pela tela.
3. Teste vermelho antes / verde depois — ver Prova.
4. Nenhuma funcionalidade fora do título foi alterada; nada da tela sumiu (item por item acima).

## Prova
- verde depois: `npx vitest run src/components/talkx/__tests__/TalkXSegments.viewMode.test.tsx` -> `Test Files 1 passed (1); Tests 2 passed (2)`.
- sem regressão: os 9 arquivos de teste que renderizam `TalkXSegments` (library, states, route, groups, builder, detailFresh, paginacao, periodo, RuleValueInput) + o novo -> `Test Files 10 passed (10); Tests 44 passed (44)`.
- vermelho antes: com as versões de `HEAD` de `TalkXSegments.tsx` e `useTalkXSegments.ts` no lugar das minhas, o mesmo teste novo falha nos 2 casos (não existe `segments-list`/`segments-grid`), e volta a passar ao restaurar. Comando da prova vermelha e saída no log do fechar.

## NÃO FEITO (o que falta e por quê)
- CRITÉRIO 1, parte do reuso: **não reutilizei o `SegmentSideList`/lista lateral da X112** porque esse arquivo (`src/components/talkx/segments/SegmentSideList.tsx`, criado pela TL-134/X112 nos commits 5918f7d9bd / dd6c21eca4) NÃO existe na base `dia/2026-10-13` deste workspace. Provas no próprio workspace: `git grep SegmentSideList -- src` = vazio; `git merge-base --is-ancestor <commit da TL-134> HEAD` = não (o commit não é ancestral do HEAD). Sem o arquivo na base, reutilizá-lo exigiria copiar trabalho de outro cartão — escopo do integrador, não meu. FALTA: integrar a lista lateral (TL-134/X112) na branch do dia; depois disso a alternância continua válida, pois o estado vive no hook e o contêiner só troca de classe.
- O que ENTREGUEI no lugar, para o objetivo do cartão ("alternar lista/grade sem duplicar componente visual"): UM único `SegmentCard` servindo aos dois modos (contêiner `flex-col` = `segments-list` × `grid` = `segments-grid`), sem segunda árvore visual.
