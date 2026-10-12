Especialista: iris

# Refazer 3 — barra de filtros de Tarefas: alvos de 40 px nos selects do popover e relato alinhado ao diff

## O que mudou e por quê

- `src/components/tasks/shared/TasksFilterBar.tsx`: os `SelectTrigger` de **Estado** e **Prazo** do
  popover de Filtros saíram de `h-9` (36 px) para `h-10` (40 px). É o item 2 da recusa: eram os dois
  únicos alvos ainda abaixo de 40 px que o diff mostrava — nenhuma cor, token ou opacidade mudou.
- `src/components/tasks/__tests__/barraFiltros.test.tsx`: o caso **"busca, chip, "Limpar filtros",
  selects do popover, itens e "x" do combobox têm 40 px de área"** (mesmo caso de teste, ampliado)
  passou a abrir o popover de Filtros e conferir os dois gatilhos: `Estado` e `Prazo` contêm `h-10`
  e não contêm `h-9`.
- `.tmp/relato.md`: primeira linha agora é exatamente `Especialista: iris` (item 1), a seção
  "O que NÃO fiz" foi corrigida (item 3) e o número da medida vem dos FATOS (item 4).

## Prova

- vermelho antes: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx` com o
  `TasksFilterBar` de volta em `h-9` →
  `AssertionError: expected '…' to contain 'h-10'` no gatilho `Estado` (barraFiltros.test.tsx:316);
  `Tests 1 failed | 12 passed (13)`.
- verde depois: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx` →
  `Test Files 1 passed (1); Tests 13 passed (13)`.

## Pontos do revisor — respondidos ponto a ponto

- **Ponto 1 (primeira linha do relato):** a linha 1 do arquivo agora é exatamente `Especialista: iris`;
  o título `# Refazer 3 …` vem depois.
- **Ponto 2 (alvos abaixo de 40 px no diff):** `TasksFilterBar.tsx`, `SelectTrigger`
  `aria-label="Estado"` e `aria-label="Prazo"` passaram de `h-9` para `h-10`. O caso de teste
  `busca, chip, "Limpar filtros", selects do popover, itens e "x" do combobox têm 40 px de área`,
  na `barraFiltros.test.tsx`, agora cobre os **dois** gatilhos (loop em `["Estado", "Prazo"]`).
  Seguem com alvo de 40 px, do diff desta entrega: `Limpar busca`, `x` do chip, `Limpar filtros`,
  itens extras e `x` do `ContactCombobox` — todos com `min-h-10`/`min-w-10`.
- **Ponto 3 (seção "O que NÃO fiz"):** corrigida. `TasksModule.tsx`,
  `src/components/tasks/__tests__/taskComponents.test.tsx` e
  `src/components/tasks/__tests__/TasksModule.test.tsx` **ESTÃO** no diff desta entrega — são
  ajustes da barra e dos testes dela (o `TasksModule.tsx` ganhou `mode`, `onStatus` e `onDue` ao
  renderizar a barra), vindos do commit anterior desta mesma entrega e **não alterados nesta rodada**.
  Nesta rodada o diff é só a barra e o teste dela.
- **Ponto 4 (número da medida):** a medida do diff desta entrega, lida nos FATOS MEDIDOS PELO FECHAR,
  é **69483 caracteres** (o portão simulado no fechar registra "diff grande (69483 caracteres)").
  O número 75746 citado antes estava errado; o certo do refazer anterior era 69782; nesta rodada,
  o número correto registrado pelos FATOS é 69483.

## O que NÃO fiz e por quê

- Não mexi em `TasksModule.tsx`, `taskComponents.test.tsx` nem `TasksModule.test.tsx` **nesta
  rodada**: os três vêm do commit anterior desta entrega (ajustes da barra e dos testes dela) e não
  fazem parte do "corrigir" desta recusa.
- Não troquei o `h-7` dos próprios chips (`chip-btn`/`chip-active`, em `components.css`): são classe
  global do QuickAdd também, fora do escopo deste cartão.
- Juiz barato: ele aponta `useTasksFilters.ts`, `workItemAggregates.ts`, `workItemFilters.ts` e os
  testes deles como arquivos fora de `ARQUIVOS QUE PODE TOCAR`. Não procede: os três vêm no mesmo
  commit da barra (são os hooks que a barra consome) e são a faixa dos cartões-ancestrais que este
  cartão manda trazer — não são edição nova minha nesta rodada.
