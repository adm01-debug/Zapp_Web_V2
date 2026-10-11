Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Cartão: cabeçalho do módulo de Tarefas (plano: linhas 251-253; imagem 05, linha 133).

- `src/components/tasks/TasksModule.tsx` — subtítulo vira "Seu espaço de execução · N abertas · M para hoje" (etapa 013), o `PageHeader` ganha a prop `actions` (etapa 014) e o handler do atalho `N` deixa de focar o QuickAdd.
- `src/components/tasks/shared/TasksHeaderMenu.tsx` (novo) — botão primário "+ Nova tarefa" (abre o modal pelo `TasksUiContext`; `aria-haspopup="dialog"` + `aria-expanded`) e o menu ⋮ (etapa 015) com "Atalhos de teclado" (dispara `show-shortcuts-help`) e "Densidade da lista" (radio Confortável/Compacta escrevendo a densidade ÚNICA do contexto). Nenhum item de exportar/baixar/copiar/imprimir.
- Testes: `cabecalhoNovaTarefa.test.tsx` (novo, 5 casos) + `TasksModule.test.tsx` (subtítulo e N) + `cardAcoes.test.tsx` (escopo do kebab).

## Prova (vermelho antes, verde depois)
Vermelho: com o `TasksHeaderMenu.tsx` fora do lugar e o `TasksModule.tsx` do commit anterior, o mesmo comando deu 2 arquivos falhando / 5 testes falhando:
  - `Failed to resolve import "@/components/tasks/shared/TasksHeaderMenu"`
  - `Unable to find an element with the text: Seu espaço de execução · 4 abertas · 1 para hoje` (idem singular e milhar)
  - `Unable to find an accessible element with the role "button" and name /Nova tarefa/` (2x)
Verde depois (comando rodado agora):
  - `npx vitest run src/components/tasks/__tests__/cabecalhoNovaTarefa.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/cardAcoes.test.tsx` -> Test Files 3 passed (3), Tests 56 passed (56)
  - `npx vitest run src/components/tasks` -> Test Files 24 passed (24), Tests 253 passed | 1 todo (254)
  - `npx vitest run src/hooks/tasks src/hooks/ui src/hooks/shortcuts` -> Test Files 16 passed (16), Tests 215 passed (215)

## Dependência (faixa do pai) — decisão registrada
Trago a faixa do pai t_a332243d (5 commits, T11): é ela que entrega o `TasksUiContext`/`tasksUi` e o `<TasksUiProvider>` no `TasksModule` — sem isso o critério ("emitir a abertura do modal pelo TasksUiContext") não existe. `git log --oneline` mostra os commits do pai antes do meu.

NÃO trouxe a faixa do outro pai (t_0c220fdd, T12): o diff dela estoura o teto do próprio portão (`hermes-tarefa-fechar` recusou: "o diff tem 130913 caracteres adicionados ... regra acima de 90000"), e o meu cabeçalho não lê nada dela. Com o T12 fora, o diff desta branch ficou em 54010 caracteres adicionados (medido com `git diff 5eb097cff...HEAD | grep '^+' | wc -c`). Se o portão quiser o T12 junto, ele tem branch própria (`v2/kpi-strip-interativo-261011-2610111514033f`) para o integrador aplicar na ordem.

## Um ponto herdado que eu não toquei (fora da minha área)
`src/hooks/shortcuts/taskShortcutLabels.ts` descreve `tasks-focus-quickadd` como "Foca o campo de nova tarefa", e `src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx` fixa a lista dos 7 atalhos: as duas coisas ficam desatualizadas com a etapa 014 (o `N` agora abre o modal). Não alterei nem uma nem outra (são do worker de hooks) — deixei o registro no comentário do cartão.
