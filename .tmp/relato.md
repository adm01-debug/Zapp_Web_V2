Especialista: iris

## Resultado: concluído
O modal "Nova tarefa" está entregue e o teste do modal ficou autossuficiente. O ponto do refazer era o teste `newTaskDialog.test.tsx` importar o harness compartilhado `@/test/mocks/tarefas` (arquivo de OUTRO cartão) para registrar mocks que ele não usa: o modal não toca Supabase/useAuth, e o único serviço externo, `useContactsSearch`, já é trocado localmente no próprio arquivo. Empilhado sem esse arquivo, o import falhava na resolução e derrubava o arquivo inteiro ANTES de qualquer asserção — exatamente o vermelho apontado pelo limpador (só o caminho do arquivo, sem mensagem de asserção). Nenhuma asserção foi removida nem afrouxada.

## Arquivos do diff
- src/components/tasks/shared/new-task/TaskTitleField.tsx (novo): campo "Título da tarefa" — obrigatório, `maxLength` 200 tirado do MESMO número do contador, `aria-required`/`aria-invalid`/`aria-describedby` e erro inline `role="alert"`.
- src/components/tasks/shared/new-task/PrioritySegment.tsx (novo): prioridade segmentada (Baixa, Média padrão, Alta, Urgente) em radiogroup ARIA com tabindex móvel e setas com volta no fim; cores só de tokens (`primary` na escolhida, `muted`/`border` nas demais).
- src/components/tasks/shared/NewTaskDialog.tsx (novo): o diálogo "Nova tarefa" com cabeçalho, título, contato e prioridade, montado sob demanda.
- src/components/tasks/TasksModule.tsx: passa a ler `useTasksUi` e montar `<NewTaskModal />`, que carrega o diálogo por `import()` dinâmico + `Suspense` (o pedaço entra no bundle só quando `modalOpen`).
- src/components/tasks/__tests__/TasksModule.test.tsx: +1 caso — com o contexto fechado o diálogo não está no DOM.
- src/components/tasks/__tests__/newTaskDialog.test.tsx: 7 casos do modal; neste refazer, removido o `import '@/test/mocks/tarefas'` (motivo acima) e registrado em comentário.

## Prova
- vermelho antes (versão antiga do teste, harness ausente da árvore): `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Test Files 1 failed (1); Tests no tests`
- verde depois (versão corrigida, harness ausente): mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`
- verde depois (árvore normal, harness restaurado): mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`
- suíte das tarefas: `npx vitest run src/components/tasks` → `Test Files 29 passed (29); Tests 329 passed | 1 todo (330)`
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (60s)` (db_guard, tipos, lint e migrations OK)

## Ponto do refazer
- Ponto 1 (quebra os TESTES no empilhamento em src/components/tasks/__tests__/newTaskDialog.test.tsx): corrigido — o arquivo não importa mais o harness de outro cartão e prova o mesmo comportamento (7 casos), sem alterar asserção.
