Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/board/BoardColumn.tsx` — etapa 091: o QuickAdd compacto saiu do topo e passou a ser o cartão tracejado `capture-card` no FIM da Caixa de entrada (linha 227), com a dica "Pressione Enter para criar" (linha 230); só `status === 'backlog'` o recebe (D19, linha 107 do plano).
- `BoardColumn.tsx` — etapa 092: cada cartão da coluna Concluído ganha o carimbo `done-stamp` (linha 176) com o check verde (token `text-success`, definido em `tailwind.config` e `src/styles/tokens.css`) e a data da conclusão pelo formatador do módulo (`formatWorkItemDate(completed_at, { format: 'day' })`); o botão da janela virou `board-done-older` no RODAPÉ da coluna (linhas 214–223), com o rótulo do plano "Ver até 30 dias →".
- `BoardColumn.tsx` — etapa 093: o ⁙ do cabeçalho (linha 112, `board-collapse-done`, `aria-expanded`) recolhe/expande a coluna — recolhida só o cabeçalho fica e a coluna passa a `flex-none w-[200px]`, mantendo o piso de 200px das outras (é o que `quadroLarguraFocoContraste` mede).
- `BoardColumn.tsx` — etapa 103: o vazio por coluna passou a `board-column-empty` (linhas 164–167) com a microcopy do plano "Nada aqui. Arraste uma tarefa ou capture acima" + a política da coluna; o esqueleto por coluna já é o `BoardColumnSkeleton` (etapa 53).
- `src/components/tasks/board/TasksBoardMode.tsx` — etapa 093: toggle `board-done-toggle` (linha 156, `aria-pressed`). Ligado (padrão) = coluna Concluído no trilho; desligado = a coluna sai do trilho. A régua `colunasVisiveis` alimenta o trilho, os dots e o rótulo da tela estreita. É diferente do switch "Mostrar concluídas" da barra de filtros, que corta os ITENS da consulta — aqui muda a COLUNA.
- `src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx` — 9 casos novos (091, 092, 093, 103), todos pelo componente REAL (`TasksBoardMode` → `BoardColumn`), com asserção de DOM (nada de mock que já traz a resposta).
- `src/components/tasks/__tests__/taskComponents.test.tsx` e `.../TasksModule.test.tsx` — troca textual exigida pela etapa: rótulo "Ver mais antigas (30 dias)" → "Ver até 30 dias →" e o vazio por texto → teste por `board-column-empty`, com a MESMA força (5 colunas e 4 colunas vazias; e a negação no carregamento).

## Prova
- vermelho antes (só o teste novo, com `BoardColumn`/`TasksBoardMode` na base): `npx vitest run src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx` → `Tests  6 failed | 3 passed (9)` (os 3 verdes são os que já existiam: nenhuma outra coluna captura, Enter cria, esqueleto).
- verde depois (mesmo comando): `Test Files  1 passed (1)` / `Tests  9 passed (9)`.
- regressão da área: `npx vitest run src/components/tasks` → `Test Files  24 passed (24)` / `Tests  247 passed | 1 todo (248)`.
- `npx eslint` nos 5 arquivos tocados → sem saída (exit 0); `npx tsc --noEmit -p tsconfig.app.json` → sem saída (exit 0).

## Critério de pronto, item por item
- 091 captura na Caixa de entrada → `BoardColumn.tsx:227` + testes "mostra o cartão tracejado no FIM da Caixa de entrada, com a dica e o QuickAdd compacto" e "Enter no campo cria a tarefa na Caixa de entrada".
- 092 coluna Concluído (check verde + data + "Ver até 30 dias →") → `BoardColumn.tsx:176` e `:215` + testes "cada cartão concluído leva o check verde e a data da conclusão" e "o 'Ver até 30 dias →' é o rodapé da coluna Concluído e revela a janela".
- 093 toggle "Concluídas" e ⁙ → `TasksBoardMode.tsx:156` e `BoardColumn.tsx:112` + testes "nasce ligado com as 5 colunas e, desligado, tira a coluna Concluído do trilho" e "o ⁙ do cabeçalho recolhe a coluna (só o cabeçalho fica) e expande de volta".
- 103 esqueleto e vazio por coluna → `BoardColumn.tsx:164` + testes "toda coluna vazia mostra a microcopy única e a sua política" e "carregando, cada coluna traz 3 esqueletos e nenhum vazio".
- Estados da tela alterada: vazio (teste), carregando (esqueleto, teste); erro não existe nesta peça — a coluna não lê o servidor, o erro do hook aparece no módulo, fora do meu diff.

## Conferência contra o plano (as imagens não são legíveis nesta sessão)
- seção 3, linha 146 ("Capturar tarefa — Pressione Enter para criar" tracejado) → etapa 091, entregue.
- seção 3, linha 147 ("Concluído com ícone de menu, check verde e Ver até 30 dias →") → etapa 092: check verde e o rótulo exato do plano; o ícone do cabeçalho é o ⁙ da linha 149 (o plano não define outra ação de menu).
- seção 3, linha 149 ("Toggle Concluídas ligado = coluna Concluído visível") → etapa 093, semântica definida e provada: ligado (padrão) = coluna visível.
- etapa 103 (linha 362): a microcopy foi copiada letra a letra.
- Não abri 01.png–05.png: não há ferramenta de visão nesta sessão; li o plano em texto (linhas citadas) e o `docs/tarefas/ESPECIFICACOES.md` (cartão T01) não existe na minha cópia.

## O que NÃO fiz e por quê
- Não criei menu de ações no cabeçalho do Concluído: o plano não define nenhuma ação para ele; o "ícone de menu" da linha 147 é o ⁙ da etapa 093.
- Não toquei em `WorkItemCard.tsx` nem em `TasksEmptyState.tsx` (fora da lista de arquivos do cartão): o check+data saem do `BoardColumn` e a microcopy do vazio veio para o `BoardColumn` (o variant `column` do `TasksEmptyState` fica sem uso).
- Não mexi no `QuickAdd.tsx`: o modo compacto já criava no Enter; o cartão tracejado e a dica são do `BoardColumn`.
- Não criei os "primitivos de captura da faixa" (`e2e/helpers/quadro.ts`, `e2e/quadro-basico.spec.ts`): não existem na minha cópia (`git ls-files e2e | grep -i quadro` → só `e2e/tarefas-quadro.spec.ts`); não invento arquivo novo de e2e.
- Não implementei "+ Nova tarefa" por coluna (D19, linha 107: NÃO IMPLEMENTAR) nem "ordenar coluna" (decisão declarada da etapa 093: posição manual e ordem por data de conclusão do Concluído).
