## FATOS MEDIDOS PELO FECHAR (11/10 19:47, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 -
 src/components/tasks/TasksModule.tsx               |   5 +
 .../tasks/__tests__/TasksListMode.test.tsx         |   4 +-
 .../tasks/__tests__/TasksModule.test.tsx           |   2 +-
 .../tasks/__tests__/WorkItemCard.test.tsx          | 130 ++++++-
 .../tasks/__tests__/agendaGroups.test.tsx          |   2 +-
 .../quadroArrastarTecladoRolagem.test.tsx          | 374 +++++++++++++++++++++
 .../quadroCapturaConcluidoToggleVazios.test.tsx    | 190 +++++++++++
 .../tasks/__tests__/taskComponents.test.tsx        |  16 +-
 src/components/tasks/board/BoardColumn.tsx         | 203 +++++++++--
 src/components/tasks/board/TasksBoardMode.tsx      | 172 +++++++++-
 .../BoardColumn.subtitulo-limite.test.tsx          | 270 +++++++++++++++
 src/components/tasks/board/boardInteracao.ts       |  62 ++++
 src/components/tasks/shared/ContactAvatar.tsx      |  57 ++++
 src/components/tasks/shared/DateLabel.tsx          |  66 ++++
 src/components/tasks/shared/PriorityPill.tsx       |  47 +++
 src/components/tasks/shared/StatusPill.tsx         |  42 +++
 src/components/tasks/shared/TaskCheckbox.tsx       |  54 +++
 src/components/tasks/shared/TasksUiContext.tsx     |  42 +++
 src/components/tasks/shared/WorkItemCard.tsx       | 169 +++++++---
 src/components/tasks/shared/pointerMedia.ts        |  52 ++-
 src/components/tasks/shared/tasksUi.ts             |  40 +++
 src/hooks/tasks/useMyWorkItems.ts                  |   2 +-
 src/hooks/tasks/workItem.types.ts                  |  14 +-
 src/hooks/tasks/workItemFormat.ts                  | 113 +++++++
 25 files changed, 2018 insertions(+), 128 deletions(-)
```
- Testes alterados neste cartão (8 arquivo[s]) rodados AGORA no seu commit: Test Files 8 passed (8);Tests 125 passed (125)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff grande (120997 caracteres): cartão deveria ser menor; padrão sensível: padrão:\bDROP\b
