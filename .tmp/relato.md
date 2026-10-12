Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- src/components/tasks/__tests__/TasksFilterBar.test.tsx (NOVO, único arquivo de código do diff): tranca pela TELA REAL (TasksModule montado com a barra, o useTasksFilters e a URL de verdade) os seis casos do cartão — busca por texto (digitação imediata, debounce de 200ms, "Limpar" que cancela o debounce pendente); dropdowns (Select de Prioridade abre por pointerDown, lista as opções e aplica); popover de filtros (Contato: abre, marca, fecha ao escolher e desmarca); indicador de filtro ativo (o "Limpar"/X aparece, reflete e remove); sincronia com a URL (deep-link lido na montagem + cada controle escrevendo o seu parâmetro e o padrão sem escrever nada); toggle de concluídas respeitando a janela de 7 dias (G-8), com o rodapé "Ver mais antigas (30 dias)" provando que é a janela que esconde a concluída de 13 dias. Cada `it` cita a linha da seção 8-bis que protege.
- Nenhum arquivo de produção mudou: as 4 edições de mutação usadas na prova foram revertidas com `git checkout --`; o diff de código é só o arquivo de teste novo.

## Prova
- vermelho antes (ADERÊNCIA: mutei 4 comportamentos de produção, rodei, restaurei) — `npx vitest run src/components/tasks/__tests__/TasksFilterBar.test.tsx`:
  1. debounce removido em src/hooks/tasks/useTasksFilters.ts → `× a digitação anda na hora e o recorte só chega depois do debounce`;
  2. `prio` ignorado no parse em src/hooks/tasks/workItemFilters.ts → `AssertionError: expected 'Todas as prioridades' to contain 'Alta'`;
  3. `onContact` removido do CommandItem em src/components/tasks/shared/TasksFilterBar.tsx → `AssertionError: expected 'Todos os contatos' to be 'Ana Souza'`;
  4. janela 7d→30d em splitDoneByRecency (src/hooks/tasks/workItemAggregates.ts) → `expected <span …(1)></span> to be null` (a "Feita antiga" apareceu sem o rodapé).
  Rodada mutada: `Tests 4 failed | 4 passed | 1 todo (9)`.
- verde depois (mesmo comando, árvore limpa): `Test Files 1 passed (1)` / `Tests 8 passed | 1 todo (9)` — zero falhas, zero pulados; o `1 todo` é o caso declarado na nota abaixo (não pulado).
- também rodei a rodada final com `Duration 6.20s`, sem `skip`/timeout alterado em nenhum teste existente.

## Nota de escopo
- O `it.todo` do arquivo é o caso "chips de filtro ativo com X": o chip não existe no HEAD — a etapa 044 (iris) é dona do chip e do popover "Filtros" (imagem 05 do plano). Hoje quem indica e remove o filtro ativo na tela é o botão "Limpar" (X), coberto no caso verde. Trocar o todo pelo caso verde é uma linha quando a 044 integrar. Registrado também em kanban_comment.
- O dropdown de agrupamento por prazo (D1) também não existe no HEAD (opcional/T08) e não virou teste.
- Não toquei em produção, em teste existente, nem em dado real.
