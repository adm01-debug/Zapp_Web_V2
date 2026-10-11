Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/TaskCheckbox.tsx` (novo): checkbox CIRCULAR (D16), `<button>` nativo com `role="checkbox"`/`aria-checked` e os mesmos nomes acessíveis do card ("Concluir tarefa"/"Reabrir tarefa"). Uma implementação para Lista, Quadro, Agenda, painel e modal — o clique não sobe para o card.
- `src/components/tasks/shared/PriorityPill.tsx` (novo): pílula de prioridade com um par de cor por prioridade (D12). Os rótulos vêm de `workItemLabels.ts` (nunca do `PriorityChip.tsx`); prioridade nula/desconhecida cai em `medium`.
- `src/components/tasks/shared/StatusPill.tsx` (novo): pílula de estado com cor própria; "Fazendo" azul cheio, "Aguardando" pelo token de TEXTO do aviso, "Cancelada" riscada. O rótulo sai do `KANBAN_COLUMNS` (mesma fonte do quadro).
- `src/components/tasks/shared/DateLabel.tsx` (novo): data do módulo delegando ao `workItemFormat.ts` (regra única, D21) — Hoje/Ontem/Amanhã com hora, `format="day"` para concluídas, "Sem prazo" quando vazio, par de texto destrutivo quando atrasado e o de aviso quando é hoje.
- `src/components/tasks/shared/ContactAvatar.tsx` (novo): foto quando existe (`alt=""`, imagem decorativa) e inicial sobre a cor determinística de `getAvatarColor` quando não; nome acessível no contêiner (`role="img"` + `aria-label`).
- `src/components/tasks/shared/tasksUi.ts` + `TasksUiContext.tsx` (novos): contexto de UI (seleção, painel, modal, densidade) e o `TasksUiProvider`. O hook/contexto ficaram num `.ts` separado do `.tsx` de propósito — exportar hook de arquivo com JSX conta dívida NOVA no `react-refresh/only-export-components` (o lint tem `baseline` e recusa ocorrência nova). É a única divergência do "ARQUIVOS QUE PODE TOCAR", e é o mesmo padrão que o módulo já usa (`workItemLabels.ts`).
- `src/components/tasks/TasksModule.tsx` (5 linhas): só envolvi o conteúdo no `<TasksUiProvider>`; nenhuma lógica de tela mudou. Migrar o `selectedItem` interno para o contexto é das etapas seguintes (T14/T15), não deste cartão.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Error: Failed to resolve import "@/components/tasks/shared/TaskCheckbox" ... Does the file exist?` / `Test Files 1 failed (1); Tests no tests`.
- verde depois: `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Test Files 1 passed (1); Tests 26 passed (26)`.
- módulo inteiro (o wrap do provider não regride nada): `npx vitest run src/components/tasks` → `Test Files 23 passed (23); Tests 248 passed | 1 todo (249)`.
- lint: `npx eslint` nos 9 arquivos → saída vazia, exit 0 (zero avisos novos no lint-ratchet).
- tipos: `npx tsc --noEmit -p tsconfig.json` → saída vazia, exit 0.

## O que NÃO fiz e por quê
- Não toquei em `PriorityChip`, `DueChip`, `ContactChip` nem em `TasksModule.tsx` além do provider: os primitivos são novos (D16) e a substituição nos consumidores é das etapas seguintes; nada foi reescrito.
- Não migrei o estado interno do `TasksModule` para o contexto: o cartão manda só envolver o conteúdo no provider.
- Sem DDL, Edge Function, dependência nova ou mudança de valor/teto/escala.
