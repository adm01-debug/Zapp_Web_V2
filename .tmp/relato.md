# feat(tarefas): menu da linha, seleção, clique seguro e teclado da tabela (061-064)

Especialista: Íris (area-front-componentes)

## O que mudou e por quê

- `src/components/tasks/list/taskRowMenu.tsx` (novo): o menu ⋮ da linha com os
  mesmos cinco grupos do kebab do card (Abrir · Concluir/Reabrir · Lembrar-me ▸ ·
  Mover para ▸ · Cancelar) — etapa 061. Não inventa ação: chama as ações que o
  `TasksModule` já entrega ao modo Lista; o submenu "Mover para" reusa o
  `MoveTargets` (mesmas regras de coluna atual/WIP) e "Lembrar-me" respeita
  `aceitaLembrete` (estado terminal desabilita com o motivo, como no card).
- `src/components/tasks/list/TasksListTable.tsx`: a linha virou a superfície de
  seleção — `tabIndex={0}`, `data-selected`, fundo `bg-primary/10` e a barra
  esquerda de 3 px como elemento próprio (não muda a largura das colunas) —
  etapa 062. A linha lê/escreve o MESMO estado de UI do painel pelo
  `TasksUiContext` (`useTasksUiOptional`: `selectedId` marca, `openPanel` abre os
  detalhes junto com o `onOpen`), então clique e teclado caem no mesmo lugar.
  Clique seguro (etapa 063): o `onClick` da linha é ignorado quando o alvo está
  dentro de controle (`button/a/input/select/textarea/[role=menuitem]/[role=menu]`)
  e o conteúdo do menu faz `stopPropagation` — checkbox, contato, menu ⋮ e
  popovers não abrem os detalhes; o clique no vazio FORA de linha não tem handler.
  Teclado da tabela (etapa 064): ↑/↓ movem o foco entre as linhas montadas da
  tabela (sem sair da tabela nas pontas), Enter abre, Espaço e o `X` herdado
  concluem, `E` edita (o detalhe é a superfície de edição, o mesmo `E` do card) e
  Delete cancela; teclas de dentro do checkbox/menu não são tratadas (`e.target
  !== e.currentTarget`).
- `src/components/tasks/list/TasksListMode.tsx`: passa `onComplete`/`onReopen`/
  `onDelete` (que já estavam no contrato `WorkItemCardActions`) para a tabela.
- `src/components/tasks/__tests__/TasksListAcoes.test.tsx` (novo): a suíte das
  quatro etapas (ver Prova).
- `src/components/tasks/__tests__/TasksModule.test.tsx` e `cardAcoes.test.tsx`:
  dois ajustes das provas herdadas que a faixa do cartão pai mexeu — as
  asserções do recorte de KPI na Lista passaram a contar LINHAS da tabela
  (`task-row`) em vez de cards, e o teste do kebab do card busca o botão DENTRO
  do card (no Quadro o QuickAdd do topo também é "Mais opções"). Nenhum teste foi
  pulado, removido ou afrouxado: as asserções continuam as mesmas, mudou só o
  elemento que o modo Lista agora renderiza.

Faixa herdada (instrução do integrador no cartão): confirmei
`git merge-base --is-ancestor 89624767e HEAD` → ausente e trouxe por cherry-pick
os dois commits que tocam `src/components/tasks/list/`
(`d850da4ad` lista em tabela; `ed04a9529` células 056-060), resolvendo 1 conflito
em `TasksModule.test.tsx` (ficou a versão da faixa, que é a que descreve a tabela).

## Prova

- vermelho antes: `npx vitest run src/components/tasks/__tests__/TasksListAcoes.test.tsx`
  → `Tests 9 failed (9)` (`Unable to find an accessible element with the role "button" and name "Mais opções"`, `expected null to be 'false'`, `expected 'nada' to be 's2'`) — o teste novo entrou antes do código.
- verde depois: `npx vitest run src/components/tasks/__tests__/TasksListAcoes.test.tsx`
  → `Test Files 1 passed (1); Tests 9 passed (9)`.
- sem regressão: `npx vitest run src/components/tasks`
  → `Test Files 30 passed (30); Tests 344 passed | 1 todo (345)`.
- `npx tsc -b --force` → exit 0.
- `npx eslint` nos 4 arquivos tocados → exit 0.

## O que NÃO fiz e por quê

- Sem migration, sem Edge Function, sem dependência nova (critério 2): só a pasta
  `src/components/tasks/list/` e a suíte de testes deste módulo.
- Não toquei `TaskCheckbox`, `WorkItemCard`, `MoveToMenu` nem `TasksModule`: o
  contrato que a linha precisa já existe (`onOpen`, `onToggleDone`, `onDelete`,
  `cardActions`, `MoveTargets` e `TasksUiContext`).
  "E edita" cai no painel de detalhes porque é ele a superfície de edição — não
  existe modo de edição inline na Lista em tabela.
