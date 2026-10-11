Especialista: Íris (area-front-componentes)

## O que mudou e por quê

- `src/components/tasks/list/TasksListTable.tsx` (NOVO): a Lista vira `<table>`.
  `<colgroup>` com as 6 colunas do contrato (plano 301/302: Tarefa, Contato,
  Prioridade, Prazo, Lembrete, Estado), `<thead>` fixo (`sticky top-0`) e grupos
  como LINHAS de seção (`<th scope="colgroup">`).
- Etapa 051: cada grupo tem bloco circular com ícone, título e CONTADOR, na ordem
  Atrasadas (destrutivo, `AlertTriangle`) · Hoje (relógio, âmbar) · Amanhã ·
  Próximas (com subcabeçalho por dia) · Sem prazo · Concluídas 7 dias (com o
  rodapé "ver mais (30 dias)" das concluídas de 8 a 30 dias). O contador conta as
  linhas REALMENTE desenhadas (inclui as antigas quando reveladas).
- Etapa 051: "Hoje" mostra `daySubtitle(ancora)` de `workItemAggregates`
  ("Domingo, 11 de outubro"), com `now` injetável no teste; "Próximas" continua
  separada por dia por `groupUpcomingByDay` (052, do Hugo).
- Etapa 053: célula Tarefa = `TaskCheckbox` (primitiva de T11) + título em uma
  linha com tooltip + o motivo em âmbar quando `status === 'waiting'`.
- Etapa 054: célula Contato = `ContactAvatar` + nome; o nome é `<button>` quando
  há `onOpenContact` (abre a conversa) e texto simples quando não há; sem contato
  mostra "Sem contato". Checkbox e contato fazem `stopPropagation` — quem abre os
  detalhes é o clique na LINHA (o `onOpen` que os cartões usavam).
- As 4 colunas de 056–060 (Prioridade, Prazo, Lembrete, Estado) já existem no
  cabeçalho e nas linhas como células vazias (`data-testid="list-cell-pendente"`).
- `src/components/tasks/list/TasksListMode.tsx`: passa a renderizar
  `TasksListTable`; esqueleto e os dois vazios seguem no modo, e a montagem no
  `TasksModule` não mudou.
- Testes existentes que falavam com a Lista de CARTÕES foram re-apontados, sem
  afrouxar asserção nenhuma:
  - `TasksListMode.test.tsx`: `getByRole('article')` → `getByTestId('task-row')`;
    `getByRole('button', { name: 'Concluir tarefa' })` → `getByRole('checkbox',
    { name: 'Concluir tarefa' })` (a primitiva marca `role="checkbox"`, que é o
    papel correto do controle).
  - `TasksModule.entrada.test.tsx` e `zen.tarefas.test.tsx`: o marcador de "carga
    desenhada" na Lista passou a ser `task-row`.
  - `WorkItemSheet.test.tsx` (caso 26): quem abre o Sheet pela Lista agora é o
    clique na linha — o mesmo `onOpen`.
  - `cardAcoes.test.tsx` (casos 29/32) e `TasksModule.test.tsx` (etapas 77/78,
    "card em foco", kebab e DnD): o card, o kebab e o `contact-chip` vivem no
    Quadro agora; o modo de fundo virou `board` (e `agenda` no caso "fora do
    Quadro o card não se diz arrastável", com prazo de hoje para o card existir).
    Duas exceções continuam na Lista em tabela: o QuickAdd do topo e o caso
    "N abre o modal" (no Quadro cada coluna tem o seu QuickAdd, e o seletor
    ficaria ambíguo).

## Prova

- VERMELHO ANTES (a Lista antiga, de cartões, restaurada com
  `git show HEAD:src/components/tasks/list/TasksListMode.tsx > src/components/tasks/list/TasksListMode.tsx`):
  `npx vitest run src/components/tasks/__tests__/TasksListTable.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx`
  → `× o checkbox conclui sem abrir o card (onToggleDone sem onOpen)`;
  `× na seção "Concluídas" o checkbox é o de reabrir e desfaz pelo onToggleDone`;
  `× 3) o modo Lista passa a renderizar a tabela, com a linha do item dentro dela`;
  `Test Files 2 failed (2)` / `Tests 3 failed | 13 passed (16)`.
- VERDE DEPOIS (mesmo comando, código novo): `Test Files 2 passed (2)` /
  `Tests 17 passed (17)`.
- VERDE DEPOIS (área inteira, `npx vitest run src/components/tasks src/hooks/tasks`):
  `Test Files 34 passed (34)` / `Tests 395 passed | 1 todo (396)`. Sem o meu
  trabalho a mesma seleção dava `Test Files 33 passed (33)` /
  `Tests 386 passed | 1 todo (387)` — nenhuma regressão, e as 9 provas novas de
  `TasksListTable.test.tsx` entraram na conta (387 + 9 = 396).
- `npx tsc --noEmit -p tsconfig.app.json` → saída vazia (0 erros).
- `npx eslint` nos 2 arquivos de `list/` e nos 7 arquivos de teste tocados →
  saída vazia (0 problemas).

## CRITÉRIO DE PRONTO do cartão, item por item

- "Etapa 050, tabela com cabeçalho fixo e grupos como linhas de seção" — plano
  linhas 302 e 50 (seção 3: "Tabela: colunas Tarefa, Contato, Prioridade, Prazo,
  Lembrete, Estado"). Testes: `1) desenha as 6 colunas do contrato na ordem, num
  cabeçalho fixo` (com `role="columnheader"` e `sticky` em cada `<th>`).
- "Etapa 051, linha de grupo com ícone circular, contador e subtítulo em Hoje" —
  plano linha 303. Testes: `2) a linha de grupo traz ícone circular, contador e o
  subtítulo de data no "Hoje"` (Atrasadas com ícone+contador 2, Hoje com
  "Domingo, 11 de outubro") e `2b) "Próximas" sai separada por dia, com o
  subcabeçalho de cada dia` (2 dias distintos, 2 linhas de dia, 2 itens).
- "Etapa 053, célula Tarefa" — plano linha 305. Testes: `4) a célula Tarefa
  conclui pelo checkbox sem abrir a linha e mostra o motivo âmbar` (motivo
  "Aguardando aprovação do cliente", `onToggleDone` chamado, `onOpen` não) e
  `4b) a linha VENCIDA/concluída usa o checkbox de reabrir`.
- "Etapa 054, célula Contato" — plano linha 306. Testes: `5) a célula Contato
  mostra avatar e nome e abre a conversa sem abrir os detalhes` (nome "Ana
  Souza" é `<button>`, `onOpenContact` chamado, `onOpen` não) e `5b) sem contato
  a célula diz "Sem contato" e não é acionável` (nem botão).
- "estrutura + clique na linha abre os detalhes + as 4 colunas seguintes já no
  lugar" — testes: `3) o modo Lista passa a renderizar a tabela, com a linha do
  item dentro dela` (a tabela existe dentro do modo e o contato do item real
  também foi passado ao modo) e `6) as colunas 056–060 já existem como célula (a
  preencher em cartão próprio)` (6 células por linha, 4 `list-cell-pendente`).
- "zapp-verify . --rapido verde": quem roda é o `hermes-tarefa-fechar`.

## O que NÃO fiz e por quê

- Prioridade, Prazo, Lembrete e Estado continuam vazias: o miolo delas é das
  etapas 056–060, fora deste cartão; a estrutura que este cartão promete está
  provada no teste `6`.
- Não criei o kebab/rolo de ações da linha: é a etapa 060+ (o card que os tinha
  vive no Quadro e na Agenda).
- Não mexi em hook, agregador, banco, Edge nem no `TasksModule`: a montagem do
  modo não muda.
- Não toquei em `workItemAggregates.test.ts` nesta etapa (ele só entrou no
  histórico linear por causa dos commits que o cartão mandava trazer).
