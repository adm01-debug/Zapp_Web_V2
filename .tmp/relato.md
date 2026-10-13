Especialista: iris

## O que mudou
- src/components/tasks/shared/new-task/TaskTitleField.tsx (novo): campo "Título da tarefa" — obrigatório, `maxLength` 200 tirado do MESMO número do contador, `aria-required`/`aria-invalid`/`aria-describedby` e erro inline `role="alert"`.
- src/components/tasks/shared/new-task/PrioritySegment.tsx (novo): prioridade segmentada (Baixa, Média padrão, Alta, Urgente) em radiogroup ARIA com tabindex móvel e setas com volta no fim; cores só de tokens do sistema (`primary` na escolhida, `muted`/`border` nas demais).
- src/components/tasks/shared/NewTaskDialog.tsx (novo): o diálogo "Nova tarefa" com cabeçalho, título, contato e prioridade.
- src/components/tasks/TasksModule.tsx: passa a ler `useTasksUi` e monta `<NewTaskModal />`, que carrega o diálogo por `import()` dinâmico + `Suspense` (o pedaço entra no bundle só quando `modalOpen`).
- src/components/tasks/__tests__/TasksModule.test.tsx: +1 caso — com o contexto fechado o diálogo não está no DOM.
- src/components/tasks/__tests__/newTaskDialog.test.tsx: 7 casos do modal; o arquivo agora é autossuficiente — registra os próprios mocks e não importa o harness compartilhado `@/test/mocks/tarefas` de outro cartão.

## Evidência (comandos rodados agora)
- `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → Test Files 1 passed (1), Tests 7 passed (7)
- `npx vitest run src/components/tasks` → Test Files 29 passed (29), Tests 329 passed (329)
- `zapp-verify . --rapido` → VERIFY: VERDE SEM BANCO (60s) — db_guard, tipos, lint e migrations OK

## Prova da correção (antes → depois)
- antes: mexendo no arquivo de teste para tirar o harness, o arquivo não carregava → Test Files 1 failed (1), Tests no tests
- depois: o mesmo arquivo, sem o harness, carrega e passa → Test Files 1 passed (1), Tests 7 passed (7)

## Ponto do refazer 1
- Ponto 1 (teste do modal no empilhamento): resolvido com o arquivo autossuficiente; as 7 asserções continuam iguais e o comportamento provado é o mesmo.
