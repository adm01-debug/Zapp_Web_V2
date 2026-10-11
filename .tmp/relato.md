# Refazer 2 — barra de filtros de Tarefas (busca, Prioridade, Contato, Filtros, chips, modos)

Especialista: iris

## O que mudou e por quê

- `src/hooks/tasks/workItem.types.ts`: devolvido ao da base do dia. Saiu `contact_type` de
  `WorkItemContact` e saiu `subtitle` das cinco entradas de `KANBAN_COLUMNS` — são campos de
  outros cartões, que o diff desta entrega não deve carregar. Ninguém no módulo de Tarefas
  consome os dois (`git grep` não acha referência fora do próprio arquivo), então nada quebra.
- `src/components/tasks/shared/TasksFilterBar.tsx`: os três alvos pequenos passaram a área
  clicável de 40 px sem mudar cor nem token — `Limpar busca` (`h-6 w-6` → `min-h-10 min-w-10`),
  o `x` do chip (`h-4 w-4` → `min-h-10 min-w-10`) e `Limpar filtros` (`h-7` → `min-h-10`).
- `src/components/tasks/shared/ContactCombobox.tsx`: mesma regra nos dois alvos do combobox —
  os itens extras do popover ganharam `min-h-10` (ficavam em 32 px) e o `x` do chip do contato
  (`h-5 w-5` → `min-h-10 min-w-10`).
- `src/components/tasks/shared/ModeSwitcher.tsx`: o comentário da etapa 032 agora nomeia a classe
  que já esconde o rótulo (`hidden sm:inline`) e explica que o `aria-label` é quem sustenta o
  nome acessível. O comportamento não mudou; o texto deixou de prometer o que não se lê no código.
- `src/components/tasks/__tests__/barraFiltros.test.tsx`: dois casos novos travando isso.

## Elemento → linha da tabela da seção 3 do plano (3.1, Lista)

- Seletor Lista / Quadro / Agenda (`ModeSwitcher.tsx`) → linha 46, etapas 031–032.
- Busca "Buscar tarefa…" (`TasksFilterBar.tsx`) → linha 47, etapa 033.
- Dropdown Prioridade → linha 47, etapas 033–037; o recorte da pílula "Todas as…" → linha 94, etapas 034–035.
- Dropdown Contato (`ContactCombobox.tsx`) → linha 47, etapas 033–037; "Todos os contatos" → linha 94, etapa 035.
- Botão Filtros (popover) → linha 47, etapa 036.
- Chips do filtro ativo → tabela de etapas da seção 6, linha 284, etapa 039.
- Toggle "Mostrar concluídas" → linha 49, etapa 038 (só conferido; não foi tocado nesta rodada).

## Casos de teste adicionados ou alterados por este diff

- `barraFiltros.test.tsx` → "busca, chip, "Limpar filtros", itens e "x" do combobox têm 40 px de área":
  novo; sem a correção reprova (ver a prova de mutação abaixo).
- `barraFiltros.test.tsx` → "esconde o rótulo do modo em tela estreita e mantém o nome acessível": novo;
  lê a classe real do rótulo (`hidden`, `sm:inline`) e o `aria-label` do botão.
- Comportamento da barra (busca, Prioridade, Contato, popover, chips) já vinha coberto pelos 11 casos
  do arquivo; seguem passando sem alteração de assertiva.

## Prova

- verde depois: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx` → `Test Files 1 passed (1); Tests 13 passed (13)`.
- módulo inteiro: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 31 passed (31); Tests 366 passed | 1 todo (367)`.
- typecheck: `bun run typecheck` → `tsc -b --force`, sem saída de erro.
- vermelho (mutação, alvo de 40 px revertido no `TasksFilterBar` por um instante e restaurado em seguida):
  `Tests 1 failed | 12 passed (13)` — o caso dos 40 px é o que cai; o caso do rótulo continua verde.

## Pontos do revisor

- Ponto 1 (campos de outros cartões em `workItem.types.ts`): devolvido ao da base;
  `git diff --stat dia/2026-10-11 -- src/hooks/tasks/workItem.types.ts` sai vazio e o arquivo
  sai do `git diff --stat dia/2026-10-11` desta entrega.
- Ponto 2 (alvos abaixo de 40 px): cinco alvos corrigidos com `min-h-10`/`min-w-10`
  (`TasksFilterBar`: limpar busca, `x` do chip, Limpar filtros; `ContactCombobox`: itens extras, `x`
  do contato). Nenhuma cor, token ou opacidade mudou; o teste novo mede a classe renderizada.
- Ponto 3 (comentário que prometia esconder o rótulo): o rótulo já tinha `hidden sm:inline` na
  linha seguinte; o comentário passou a nomear a classe e o teste novo lê essa classe no DOM.
- Ponto 4 (medida do teto do portão): a medida desta entrega é a que o FECHAR imprime no bloco
  `FATOS MEDIDOS` abaixo — ele mede o diff real; o número citado na recusa não é o desta entrega.

## O que NÃO fiz e por quê

- Não mexi em `TasksModule.tsx`, `taskComponents.test.tsx` nem `TasksModule.test.tsx`: são do
  cabeçalho/módulo (etapas 013–015) e não fazem parte do corrigir da recusa.
- Não troquei o `h-7` dos próprios chips (`chip-btn`/`chip-active`, em `components.css`): são
  classe global do QuickAdd também, fora do escopo deste cartão.

- Juiz barato: ele aponta `useTasksFilters.ts`, `workItemAggregates.ts`, `workItemFilters.ts` e os
  testes deles como arquivos fora de `ARQUIVOS QUE PODE TOCAR`. Não procede: os três vêm no mesmo
  commit da barra (são os hooks que a barra consome, como o próprio cartão descreve no histórico) e
  são a faixa dos cartões-ancestrais que o cartão manda trazer — não são edição nova minha nesta rodada.
