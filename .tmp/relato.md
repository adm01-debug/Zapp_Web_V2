Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- src/components/tasks/__tests__/TasksFilterBar.test.tsx (NOVO, único arquivo do diff): tranca pela TELA REAL (TasksModule montado com a barra, o useTasksFilters e a URL de verdade) os seis casos do cartão — busca por texto (digitação imediata, debounce de 200ms, "Limpar" que cancela o debounce pendente); dropdowns (Select de Prioridade abre por pointerDown, lista as opções e aplica); popover de filtros (Contato: abre, marca, fecha ao escolher e desmarca); indicador de filtro ativo (o "Limpar"/X aparece, reflete e remove); sincronia com a URL (deep-link lido na montagem + cada controle escrevendo o seu parâmetro e o padrão sem escrever nada); toggle de concluídas respeitando a janela de 7 dias (G-8), com o rodapé "Ver mais antigas (30 dias)" provando que é a janela que esconde a concluída de 13 dias. Cada `it` cita a linha da seção 8-bis que protege.
- Nenhum arquivo de produção mudou: o diff é só o arquivo de teste (as 4 edições de mutação foram revertidas — `git status --short` mostra apenas o arquivo novo).

## Prova
- vermelho antes (ADERÊNCIA: mutei 4 comportamentos de produção, rodei, restaurei): `npx vitest run src/components/tasks/__tests__/TasksFilterBar.test.tsx` com
  (1) debounce removido em src/hooks/tasks/useTasksFilters.ts → `× a digitação anda na hora e o recorte só chega depois do debounce`;
  (2) `prio` ignorado no parse em src/hooks/tasks/workItemFilters.ts → `AssertionError: expected 'Todas as prioridades' to contain 'Alta'`;
  (3) `onContact` removido do CommandItem em src/components/tasks/shared/TasksFilterBar.tsx → `AssertionError: expected 'Todos os contatos' to be 'Ana Souza'`;
  (4) janela 7d→30d em splitDoneByRecency (src/hooks/tasks/workItemAggregates.ts) → `expected <span …(1)></span> to be null` (a "Feita antiga" apareceu sem o rodapé).
  Resultado da rodada mutada: `Tests 4 failed | 4 passed | 1 todo`.
- verde depois: `git checkout --` nos 4 arquivos de produção + `npx vitest run src/components/tasks/__tests__/TasksFilterBar.test.tsx` → `Test Files 1 passed (1); Tests 8 passed | 1 todo (9); Duration 6.20s`.

## O que NÃO fiz e por quê
- `it.todo` (1, declarado): "chips de filtro ativo com X". O chip não existe no HEAD — a etapa 044 (iris) é dona do chip/popover "Filtros" (imagem 05 do plano). Hoje o indicador e o remover do filtro ativo é o botão "Limpar" (X), coberto no caso verde. Não criei UI de outro cartão; não fingi teste para elemento ausente. Isto está registrado também em kanban_comment.
- O dropdown de agrupamento por prazo (D1) não existe no HEAD (é opcional/T08) — não virou teste.
- Não mexi em produção, não mexi em teste existente (nenhum skip/timeout alterado), não trafeguei dado real.
