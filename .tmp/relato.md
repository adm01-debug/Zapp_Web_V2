Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Cartão: etapas 154–158 do modal "Nova tarefa" (plano, linhas 434–438; imagem 04, seção 3.4 — linhas 110–117 da tabela de elementos).

- `src/components/tasks/shared/NewTaskDialog.tsx` (novo) — etapa 154: o Dialog do projeto, aberto pelo `TasksUiContext` (o MESMO estado do botão "+ Nova tarefa" e da tecla `N`); fecha por Esc, pelo X ("Close" do Dialog do projeto) e pelo overlay escrevendo `closeModal()`. Cabeçalho (etapa 155) com ícone, título "Nova tarefa" e subtítulo "Capture agora. Organize o próximo passo.".
- `src/components/tasks/shared/new-task/TaskTitleField.tsx` (novo) — etapas 155/156: campo "Título da tarefa" em foco ao abrir, obrigatório, `maxLength` 200 com contador discreto do MESMO teto (20/200 anda junto do limite), erro inline "Informe o título da tarefa." só depois de tocar e sair vazio, com `role="alert"`, `aria-invalid` e `aria-describedby`.
- `src/components/tasks/shared/new-task/PrioritySegment.tsx` (novo) — etapa 158: radiogroup real (tabindex móvel: só a escolhida é tabulável) com Baixa, Média (padrão), Alta e Urgente; as setas ←/→/↑/↓ andam e dão a volta no fim; cores só de token (`primary` na escolhida, `muted`/`border` nas demais — a cor POR prioridade é da `PriorityPill`, D12/etapa 170).
- `src/components/tasks/shared/NewTaskDialog.tsx` + `TasksModule.tsx` — etapa 157: o campo "Contato" é o `ContactCombobox` já existente (avatar + nome quando há contato, "Sem contato" quando não há) e aceita `defaultContactId`/`defaultContact` para nascer pré-preenchido quando o modal vier de um contato.
- `src/components/tasks/TasksModule.tsx` — única mudança no módulo: montar o modal SOB DEMANDA (`lazy()` + `Suspense` + `modalOpen`), como a linha 434 pede ("carregado sob demanda"). Nenhuma outra linha do módulo mudou.
- Testes: `newTaskDialog.test.tsx` (novo, 7 casos) e `TasksModule.test.tsx` (+1 caso sob demanda).

## Prova (vermelho antes, verde depois)
Vermelho antes: sem os arquivos novos (`NewTaskDialog.tsx` e `new-task/`), `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Failed to resolve import "@/components/tasks/shared/NewTaskDialog"`, `Test Files 1 failed (1)`, `Tests no tests`.
Vermelho de comportamento: com o padrão da prioridade trocado de `medium` para `high`, o MESMO comando deu `Test Files 1 failed (1)`, `Tests 2 failed | 5 passed (7)`, com "etapa 158: Média é o padrão e as setas trocam o segmento escolhido" entre as falhas — a asserção morde o comportamento, não um mock.
Verde depois (comandos rodados agora):
- `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Test Files 1 passed (1)`, `Tests 7 passed (7)`
- `npx vitest run src/components/tasks` → `Test Files 25 passed (25)`, `Tests 261 passed | 1 todo (262)`
- `git commit`: pre-commit → `Lint ratchet (staged, 6 arquivo(s)): baseline=0, atual=0, mantidas=0, removidas=0, novas=0` / `OK: nenhuma nova divida de lint foi introduzida.`

Acessibilidade (critério 3): o caso "sem violação de acessibilidade (axe)" roda `axe(document.body)` com o modal aberto → 0 violações; o foco inicial é conferido com `waitFor(() => expect(document.activeElement).toBe(campoTitulo()))`; o Esc é conferido pela sonda do contexto voltando a "fechado"; `getByLabelText('Título da tarefa')` prova que o `<Label htmlFor>` está ligado ao campo.

## Contato (etapa 157) — serviço falso, componente real
`@/hooks/crm/useContactsSearch` é trocado por um falso que devolve UMA linha ("Ana Souza"); o `ContactCombobox` REAL continua montado: o teste abre o popover, clica na opção e confere no chip o avatar (inicial determinística), o nome e o `aria-label` "Contato Ana Souza. Clique para trocar". O caminho pré-preenchido usa a prop nova com contato já conhecido (sem ir ao banco).

## Dependência (faixas dos pais) — decisão registrada
Trouxe aqui: `git cherry-pick $(git rev-list --reverse --no-merges dia/2026-10-11..2d12a0c60ea32850489ec3d41575c31d47de7045)` (7 commits). Essa faixa do pai t_f6c4421e já CONTÉM, na ordem, as faixas dos outros dois pais (t_3d9b0963 e t_a332243d) — por isso trouxe só ela, em vez de repetir os três cherry-picks e gerar commits vazios (o `--empty=drop` do cartão não existe no git 2.43 desta máquina). Sem a faixa o critério não existe: é ela que entrega `TasksUiContext`/`tasksUi`, `TasksHeaderMenu` e os primitivos (`PriorityPill` etc.) que o modal lê.

O aviso do juiz sobre "arquivo fora da lista" (ContactAvatar, DateLabel, PriorityPill, StatusPill, TaskCheckbox, TasksHeaderMenu …) é do DIFF DA BRANCH contra a `dia/2026-10-11`, não do meu commit: aqueles arquivos vieram dentro da faixa dos pais, como a seção DEPENDÊNCIA do cartão manda. O que EU escrevi são 6 arquivos — `git show --stat c17bdd86c` — todos da lista (`NewTaskDialog.tsx`, `new-task/`, `TasksModule.tsx`, `__tests__/`).

## O que NÃO fiz e por quê
- Rodapé ("Enter para criar", "Cancelar", "+ Criar tarefa", etapa 167), criação otimista (168), coluna de prévia (165) e a caixa informativa (166): são do cartão filho T36/T37 — não dupliquei escopo nem criei botão de criar sem o fluxo combinado.
- Duas colunas: a segunda coluna é a prévia (etapa 165, T37). Hoje o modal é a coluna de formulário, sem área vazia na tela; quando o T37 montar a prévia, o grid entra lá.
- Não toquei em `ContactCombobox.tsx`, `tasksUi.ts` nem `TasksUiContext.tsx` (faixa dos pais T04/T11) nem em qualquer arquivo fora da lista do cartão.
- Nenhuma nova porta de exportar/importar/copiar/imprimir, nenhum campo novo de estado/destino (a tarefa nasce na Caixa de entrada, D10).
