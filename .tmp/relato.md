Especialista: senior (telas/componentes; sem skill de área de tela disponível, usei skills de refazer/qualidade)

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemSheet.tsx`: mantive o trabalho anterior do painel/rodapé e corrigi só os pontos da recusa: o F6 não é registrado no bottom sheet, o Escape consome o evento antes de fechar, o descarte chama o fechamento com devolução de foco, e ações de rodapé com rascunho pendente passam pela confirmação "Descartar alterações?" antes de mover/cancelar.
- `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx`: acrescentei testes de comportamento para os quatro defeitos recusados, chamando o componente real (Radix + painel) e não só função auxiliar.

## Pontos da recusa
- Ponto 1: F6 no bottom sheet vazava foco para a lista mesmo em painel modal. Corrigi o efeito de F6 para não instalar listener quando `useNarrowViewport()` indica bottom sheet. Prova: `144: no bottom sheet o F6 não tira o foco do painel modal` falhou sem a correção (`AssertionError: expected false to be true`) e passou depois.
- Ponto 2: clicar "Descartar" no alerta usava `onOpenChange(false)` cru e não devolvia foco ao card. Corrigi `descartar()` para chamar `fecharDevolvendoFoco()`. Prova: `143/144: ao confirmar descarte depois do Esc, fecha e devolve o foco ao card` falhou sem a correção (`expected <input ...> to be <article ...>`) e passou depois.
- Ponto 3: `Concluir`, `Reabrir tarefa` e `Cancelar tarefa` fechavam/moviam com `mudou=true`, perdendo edição sem aviso. Corrigi os handlers para chamar `executarSemPerderRascunho`: se há rascunho, abre a confirmação de descarte e só executa a ação depois da confirmação. Prova: os testes `143: "Concluir"...`, `143: "Cancelar tarefa"...` e `143: "Reabrir tarefa"...` falharam sem a correção e passaram depois.
- Ponto 4: Escape sem alteração fechava sem `preventDefault()`, permitindo que o navegador processasse o mesmo Escape depois. Corrigi o handler para sempre consumir o Escape quando vai fechar pelo atalho. Prova: o teste existente `144: Escape sem alteração fecha e devolve foco ao card sem acionar o navegador` continua passando no arquivo real.

## Prova vermelho → verde
- vermelho antes: `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` com o `WorkItemSheet.tsx` da entrega anterior e os testes novos → `Tests  5 failed | 12 passed (17)`; falhas: foco do descarte, 3 ações com rascunho pendente e F6 no bottom sheet.
- verde depois: `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → `Test Files  1 passed (1)` / `Tests  17 passed (17)`.
- regressão relacionada: `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.test.tsx src/components/tasks/__tests__/WorkItemSheet.fuso.test.tsx src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → `Test Files  3 passed (3)` / `Tests  46 passed (46)`.
- typecheck: `bun run typecheck` → `tsc -b --force` com exit 0.
- verificação rápida: `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.

## Arquivos no diff contra a base da dia
```
src/components/tasks/TasksModule.tsx
src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx
src/components/tasks/__tests__/WorkItemSheet.test.tsx
src/components/tasks/shared/ContactAvatar.tsx
src/components/tasks/shared/DateLabel.tsx
src/components/tasks/shared/PriorityPill.tsx
src/components/tasks/shared/StatusPill.tsx
src/components/tasks/shared/TaskCheckbox.tsx
src/components/tasks/shared/TasksUiContext.tsx
src/components/tasks/shared/WorkItemSheet.tsx
src/components/tasks/shared/sheet/PainelRodape.tsx
src/components/tasks/shared/sheet/rodape.ts
src/components/tasks/shared/tasksUi.ts
src/hooks/tasks/useMyWorkItems.ts
src/hooks/tasks/workItem.types.ts
src/hooks/tasks/workItemFormat.ts
```

## Stat do diff contra a base da dia
```
src/components/tasks/TasksModule.tsx               |   5 +
 .../tasks/__tests__/WorkItemSheet.rodape.test.tsx  | 342 +++++++++++++++
 .../tasks/__tests__/WorkItemSheet.test.tsx         |  25 +-
 src/components/tasks/shared/ContactAvatar.tsx      |  57 +++
 src/components/tasks/shared/DateLabel.tsx          |  66 +++
 src/components/tasks/shared/PriorityPill.tsx       |  47 +++
 src/components/tasks/shared/StatusPill.tsx         |  42 ++
 src/components/tasks/shared/TaskCheckbox.tsx       |  54 +++
 src/components/tasks/shared/TasksUiContext.tsx     |  42 ++
 src/components/tasks/shared/WorkItemSheet.tsx      | 465 ++++++++++++++++-----
 src/components/tasks/shared/sheet/PainelRodape.tsx | 137 ++++++
 src/components/tasks/shared/sheet/rodape.ts        |  23 +
 src/components/tasks/shared/tasksUi.ts             |  40 ++
 src/hooks/tasks/useMyWorkItems.ts                  |   2 +-
 src/hooks/tasks/workItem.types.ts                  |   2 +
 src/hooks/tasks/workItemFormat.ts                  | 113 +++++
 16 files changed, 1359 insertions(+), 103 deletions(-)
```

## O que NÃO fiz e por quê
- Não removi a faixa dos pais nem os primitivos compartilhados vindos do trabalho anterior; a recusa registrou que esse ponto não procedia porque eram pré-requisito da T04/rodapé.
- Não alterei tela fora do painel de tarefas, banco, Edge Function, CI, manifesto, exportação/importação ou dependência.
