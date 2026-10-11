Especialista: iris (area-front-componentes) — executado pelo perfil designer (jev-entrada rota=designer)

## Ponto 1 da recusa (diff de 101410 > teto 90000): como resolvi
Nada de código foi tocado: tirei da faixa só o que não é deste cartão.
- Não trouxe os commits que só mexiam em `.tmp/relato.md` da rodada anterior.
- Novo commit `3767ef4c7`: tirei da faixa `board/__tests__/BoardColumn.subtitulo-limite.test.tsx` — é do pai t_15507eb6, não está nos ARQUIVOS DO CARTÃO e nada entregue aqui o cita (o pai tem branch própria).
- Medido com o comando exato da regra (`git diff --text --no-textconv --no-ext-diff --stat --patch --unified=3 dia/2026-10-11...HEAD -- .`): **81741** caracteres antes do relato; **91277** foi o pico com o relato alongado e agora fica abaixo de 90000 com este relato curto (linha medida no fechar). Antes: 101410.

## O que mudou e por quê
- `board/BoardColumn.tsx` — 091: o QuickAdd compacto virou o cartão tracejado `capture-card` no FIM da Caixa de entrada (:227) com a dica "Pressione Enter para criar" (:230); só `status==='backlog'` o recebe (D19). 092: carimbo `done-stamp` (:176) com check verde (`text-success`) + data por `formatWorkItemDate(completed_at,{format:'day'})`, e `board-done-older` no rodapé (:214–223) com o rótulo "Ver até 30 dias →". 093: ⁙ `board-collapse-done` (:112, `aria-expanded`) recolhe/expande a coluna. 103: vazio `board-column-empty` (:164–167) com a microcopy do plano; esqueleto já é o `BoardColumnSkeleton`.
- `board/TasksBoardMode.tsx` — 093: toggle `board-done-toggle` (:156, `aria-pressed`); ligado (padrão) = coluna Concluído no trilho, desligado = sai do trilho; a régua `colunasVisiveis` alimenta trilho, dots e rótulo estreito. Diferente do switch "Mostrar concluídas" dos filtros, que corta ITENS da consulta.
- `__tests__/quadroCapturaConcluidoToggleVazios.test.tsx` — 9 casos (091/092/093/103) pelo componente REAL, asserção de DOM.
- `__tests__/taskComponents.test.tsx` e `__tests__/TasksModule.test.tsx` — troca textual exigida: "Ver mais antigas (30 dias)" → "Ver até 30 dias →" e o vazio por texto → `board-column-empty`, com a mesma força.

## Prova
- vermelho antes (mutação feita agora): microcopy de `BoardColumn.tsx:165` trocada e `npx vitest run src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx` → `FAIL ... > etapa 103 ... > toda coluna vazia mostra a microcopy única e a sua política` / `Tests 1 failed | 8 passed (9)`; arquivo restaurado.
- verde depois (`npx vitest run src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx`) → `Tests 9 passed (9)`.
- quadro: `npx vitest run <novo> src/components/tasks/board/__tests__/ src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx` → `Test Files 4 passed (4)` / `Tests 29 passed | 1 todo (30)`.
- área: `npx vitest run src/components/tasks` → `Test Files 23 passed (23)` / `Tests 239 passed | 1 todo (240)`.

## Critério de pronto, item por item
- 091 → `BoardColumn.tsx:227` + "mostra o cartão tracejado no FIM da Caixa de entrada, com a dica e o QuickAdd compacto" e "Enter no campo cria a tarefa na Caixa de entrada".
- 092 → `:176`/`:215` + "cada cartão concluído leva o check verde e a data da conclusão" e "o 'Ver até 30 dias →' é o rodapé da coluna Concluído e revela a janela".
- 093 → `TasksBoardMode.tsx:156` / `BoardColumn.tsx:112` + "nasce ligado com as 5 colunas e, desligado, tira a coluna Concluído do trilho" e "o ⁙ do cabeçalho recolhe a coluna (só o cabeçalho fica) e expande de volta".
- 103 → `:164` + "toda coluna vazia mostra a microcopy única e a sua política" e "carregando, cada coluna traz 3 esqueletos e nenhum vazio".
- Plano seção 3: linhas 146/147/149 e etapa 103 (linha 362) conferidas; microcopy copiada letra a letra. Estados vazio/carregando provados; erro é do hook, fora desta peça.

## O que NÃO fiz e por quê
- Não reescrevi código: aproveitei a branch anterior por `git cherry-pick` (não recomecei).
- Não tirei da faixa o teste do pai t_d5b33620 (`WorkItemCard.test.tsx`): medi e ele **falha** contra o `WorkItemCard` novo (`Tests 3 failed | 10 passed (13)` com a versão do dia), logo é peça necessária da faixa; restaurei.
- Não criei menu de ações no cabeçalho do Concluído (o plano não define ação; o "ícone de menu" é o ⁙ de 093), não toquei `WorkItemCard.tsx`/`TasksEmptyState.tsx`/`QuickAdd.tsx`, não fiz "+ Nova tarefa" por coluna (D19: NÃO IMPLEMENTAR) nem "ordenar coluna" (decisão declarada).

## Aviso do juiz barato (arquivos fora da lista) — não procede
Os arquivos `TasksModule.tsx`, `shared/*` (ContactAvatar, DateLabel, PriorityPill, StatusPill, TaskCheckbox, TasksUiContext, tasksUi), `workItemFormat.ts`, `workItem.types.ts`, `useMyWorkItems.ts` e `WorkItemCard.tsx` são a FAIXA DOS PAIS que o PRÓPRIO CARTÃO manda trazer (`git cherry-pick` da faixa, seção DEPENDÊNCIA) e que o meu código importa — nada foi inventado fora de escopo; o que era descartável (teste do pai t_15507eb6) já saiu.
