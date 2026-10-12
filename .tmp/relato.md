Especialista: iris

## O que mudou e por quê
- `src/components/tasks/shared/NewTaskDialog.tsx` (novo): modal "Nova tarefa" — etapas 154 (Dialog sob demanda via `modalOpen` do `TasksUiContext`) e 155 (título "Nova tarefa", subtítulo "Capture agora. Organize o próximo passo.", fechar, foco inicial no título).
- `src/components/tasks/shared/new-task/TaskTitleField.tsx` (novo): etapa 156 — campo Título obrigatório, 200 caracteres, contador discreto, erro inline após blur.
- `src/components/tasks/shared/ContactCombobox` (reuso, via prop `selectedContact`): etapa 157 — "Sem contato" ou avatar + nome; `defaultContactId`/`defaultContact` pré-preenchem quando o modal nasce de um contato.
- `src/components/tasks/shared/new-task/PrioritySegment.tsx` (novo): etapa 158 — Baixa/Média (padrão)/Alta/Urgente com setas, cores por token.
- `src/components/tasks/TasksModule.tsx`: SOMENTE monta o modal sob demanda (`lazy` + `Suspense`, `NewTaskModal` quando `modalOpen`) — sem trazer `TasksHeaderMenu` nem commits dos pais.
- `src/components/tasks/__tests__/newTaskDialog.test.tsx` (novo) e `TasksModule.test.tsx` (1 caso): cobertura das etapas 154–158 + axe.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` com os 3 fontes novos movidos para `.tmp/redproof` → `Test Files 1 failed (1); Tests no tests` (falha de import: o teste chama o código real).
- verde depois: `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx` → `Test Files 2 passed (2); Tests 42 passed (42)`.
- `zapp-verify . --rapido` pós-commit → `VERIFY: VERDE SEM BANCO (11s)` (cartão só de front, sem migration; banco não verificado por não passar nome de conjunto).

## Pontos do revisor
- Ponto 1 (diff de 102528 caracteres): não procede mais — trouxe SÓ o commit da fatia própria `c17bdd86c` via `git cherry-pick` (virou `04597d0e0` após resolver o conflito de imports em `TasksModule.tsx`); os commits dos pais ficaram de fora porque a base `dia/2026-10-12` já contém os primitivos equivalentes. Diff agora só nos 6 arquivos do cartão.

## O que NÃO fiz e por quê
- Não liguei botão do cabeçalho, tecla `N` nem menu das colunas ao `openModal()`: nada na base atual chama `openModal()` e o cartão só permite tocar `TasksModule.tsx` para montar o modal — o acionamento é escopo dos cartões donos (cabeçalho/menu). O modal abre via `modalOpen` do `TasksUiContext`, mesma fonte que esses acionadores usarão.
