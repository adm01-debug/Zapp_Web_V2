Especialista: Íris (area-front-componentes)

## Como resolvi o motivo da retomada
- O motivo registrado era o conflito da entrega anterior com a branch do dia (12/10). O workspace já nasce
  da ponta atual (`BASE=dia/2026-10-13`), então não houve merge a fazer: a ponta É a base.
- Conferi no código ATUAL o que ainda faltava do pedido (080/082/083). A barra de limite + o contador
  `3/3` + o rodapé do Fazendo (082) e o tranco da coluna no drop recusado (083) JÁ estavam na ponta
  (entraram por `dacbbdbed`, que também leva `pressaoArrasto`, `colapsada` e o rodapé). O que faltava de
  fato eram os TEXTOS do subtítulo das colunas (080), que na ponta estavam nos curtos de conveniência
  ('Capture primeiro', 'Próximo passo', 'Até 3 agora', 'Com motivo', '7 dias à vista') em vez dos do plano.
- Recuperei o teste da entrega anterior de `2f6cf568e` e o movi para a pasta que o cartão autoriza
  (`src/components/tasks/__tests__/`, ajustando os imports para `../board/...`).

## O que mudou e por quê
- `src/components/tasks/board/BoardColumn.tsx`: o mapa `SUBTITULOS_COLUNA` passou aos textos da seção 3 do
  plano (etapa 080) — backlog 'A organizar', todo 'Próximas ações', doing 'Conclua uma para iniciar outra',
  waiting 'Dependências externas', done 'Últimos 7 dias'. A política longa continua só no tooltip do ⓘ.
- `src/components/tasks/__tests__/BoardColumn.subtitulo-limite.test.tsx` (restaurado da entrega anterior):
  prova 080 (rótulo curto à vista, política longa só no botão), 082 (barra `col-limit-bar` + `3/3` no
  cabeçalho + rodapé) e 083 (tranco `animate-wiggle` no drop recusado, e sem tranco no drop aceito).

## Prova
- vermelho antes (com a ponta atual, sem mexer no componente): `npx vitest run src/components/tasks/__tests__/BoardColumn.subtitulo-limite.test.tsx`
  → `Tests 2 failed | 6 passed (8)` — as duas falhas são a etapa 080 em `getByText('A organizar')`/`getByText('Próximas ações')` (as 082/083 já passavam, provando que só o texto faltava).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 8 passed (8)`.
- regressão da área: `npx vitest run src/components/tasks` → `Test Files 29 passed (29); Tests 329 passed | 1 todo (330)`.

## O que NÃO fiz e por quê
- Não mexi em `src/hooks/tasks/workItem.types.ts`: a etapa 081 é cartão do Hugo e o arquivo não está na lista
  de arquivos que este cartão autoriza. A ponta resolve os subtítulos com o mapa local em `BoardColumn.tsx`,
  e foi só nele que troquei os textos.
- Não mexi em `TasksBoardMode.tsx`: o tranco (083) já está na ponta; nada a acrescentar sem duplicar código.
- Sem DDL, Edge Function, migration ou dependência nova.
