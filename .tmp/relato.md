Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/tasks/shared/WorkItemCard.tsx: o card ganhou as etapas 084–090 — checkbox CIRCULAR pelo primitivo `TaskCheckbox` nas três superfícies (D16/084), título em até duas linhas (`line-clamp-2`; a Agenda segue `truncate` de uma linha), "Urgente" em `PriorityPill` junto ao título com a prioridade padrão descendo para a linha de contexto (085), tag "Atrasada" (ícone `AlertCircle` + texto) ao lado do prazo vencido e o prazo pelo `DateLabel` em cor destrutiva (086), rótulos "Prazo"/"Lembrete" em duas colunas e descrição curta (`line-clamp-2`) no card em "Fazendo" ou selecionado (087/088), chip de espera com ponto âmbar, motivo truncado e `title` de tooltip (089), e o estado selecionado — borda `primary`, fundo `primary/10`, alça ⠿ e `data-selected` (090). O prazo deixou de vir do `DueChip` local: é o `DateLabel` sobre `workItemFormat.ts` (a regra única de datas, T04); o atraso usa `isOverdue` do `workItemAggregates` (mesma regra do badge e do `bucketByDue`).
- src/components/tasks/__tests__/WorkItemCard.test.tsx: novo bloco com um teste por etapa (084–090), medindo cada uma pelo DOM real do componente — inclusive a seleção vinda do `TasksUiProvider.selectedId`.
- src/components/tasks/__tests__/TasksListMode.test.tsx e agendaGroups.test.tsx: as asserções do checkbox do card passaram de role `button` para role `checkbox`, porque o card agora usa o primitivo `TaskCheckbox` (role="checkbox", mesmo nome acessível "Concluir tarefa"/"Reabrir tarefa"). Nenhum teste afrouxado: só o papel acessível acompanhou o primitivo.

## Prova
- vermelho antes (card antigo, `git show HEAD^:src/components/tasks/shared/WorkItemCard.tsx`, x os testes novos):
  `FAIL src/components/tasks/__tests__/WorkItemCard.test.tsx` → `Tests 10 failed | 10 passed (20)`
- verde depois: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 31 passed (31); Tests 357 passed | 1 todo (358)`
- `npx eslint` nos 4 arquivos alterados: sem saída (0 avisos/erros).

## O que NÃO fiz e por quê
- `ContactAvatar`: o contato do card continua no `ContactChip` (testid `contact-chip`, coberto por cardAcoes/WorkItemCard), que já entrega avatar pequeno + nome (D18); trocar por dentro do `ContactChip` mexeria num arquivo fora de ARQUIVOS QUE PODE TOCAR.
- `StatusPill`: nenhuma etapa de 084–090 pede a pílula de coluna dentro do card (o "chip de espera" da 089 é ponto âmbar + motivo, não a pílula de status).
- `workItemPresets.ts`: não existe nesta faixa (a faixa T04 traz só `workItemFormat.ts`) e o card não usa presets de prazo/lembrete — isso é do painel/QuickAdd.
- A ligação de quem ABRE o painel (`TasksModule` passa a usar `openPanel` em vez do seu `selectedItem`) não é arquivo meu: o card reage a `isSelected` (prop) e ao `TasksUiProvider.selectedId`, e o teste da 090 prova os dois caminhos.

## Escopo e números (conferidos com `git diff --stat` contra a base da tarefa)
- O diff da tarefa tem 19 arquivos, 4 deles de teste, com 16 casos de teste novos.
- SÃO MEUS 4 arquivos, no commit `feat(tarefas): redesenha o cartao do quadro (etapas 084 a 090)`: `src/components/tasks/shared/WorkItemCard.tsx` + 3 arquivos de teste (`WorkItemCard.test.tsx`, `TasksListMode.test.tsx`, `agendaGroups.test.tsx`) — o card e `src/components/tasks/__tests__/`, os dois caminhos de ARQUIVOS QUE PODE TOCAR. 8 dos casos novos são meus: um por etapa 084–090 e o do caminho do provider na 090.
- Os outros 15 arquivos e os outros 8 casos NÃO são meus: são a FAIXA DOS PAIS que o próprio bloco DEPENDÊNCIA do cartão manda trazer — os primitivos compartilhados T11 (`TaskCheckbox`, `PriorityPill`, `StatusPill`, `DateLabel`, `ContactAvatar`), a base do painel (`TasksUiContext.tsx`, `tasksUi.ts`, `TasksModule.tsx`, `useMyWorkItems.ts`) e os formatos T04 (`workItemFormat.ts`, `workItem.types.ts`), mais o subtítulo/limite de coluna (`BoardColumn.tsx`, `TasksBoardMode.tsx`, `BoardColumn.subtitulo-limite.test.tsx`). Vieram nos commits `chore(tarefas): traz a faixa dos pais …` (cherry-pick de `ddc4fc76f` + a faixa de `2f6cf568e`) e `feat(tarefas): subtitulo nas colunas…`. Sem eles os primitivos que o cartão manda usar não existiriam no workspace — por isso a faixa fica no diff e não é "achado fora do escopo".
- Nenhum arquivo fora do módulo de Tarefas foi tocado por mim.
