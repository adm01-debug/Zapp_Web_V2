Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemCard.tsx` (etapa 090): a seleção agora leva o FOCO ao card.
  Novo `useEffect` com `cardRef` no `<article>`: quando o card passa a ser o item aberto nos Detalhes
  (`isSelected` ou o `selectedId` do `useTasksUiOptional()`), ele recebe `focus()`. Só na TRANSIÇÃO
  para selecionado (`eraSelecionado` guarda o valor anterior) — um card que já nasce selecionado
  (deep link `?task=`) não rouba o foco da página.
- `src/components/tasks/shared/WorkItemCard.tsx` (etapa 084): o checkbox passa a ter ALVO de 40 px.
  O círculo VISÍVEL continua com 18 px (`h-[18px] w-[18px]`, o visual do D16); o alvo é ampliado por
  pseudo-elemento ancorado no próprio botão: `relative before:absolute before:-inset-[11px] before:content-['']`
  → 18 + 11 + 11 = 40 px. O clique segue sendo do botão (o `stopPropagation` do `TaskCheckbox` impede
  que "marcar" abra o card).
- `src/components/tasks/shared/WorkItemCard.tsx` (etapa 087): o sino do lembrete fica ÂMBAR. O
  `<RemindChip>` (primitivo T11, fora dos arquivos deste cartão) pinta o ícone por herança
  (`text-destructive`/`text-muted-foreground`); envolvi só o chip num `<span>` com o variant arbitrário
  `[&_svg]:text-[hsl(var(--warning-text))]`, que emite regra própria para o `<svg>` do sino (o par de
  aviso vence a cor herdada). Não toquei no texto da hora nem no popover de adiar.
- `src/components/tasks/__tests__/WorkItemCard.test.tsx`: estendi o teste da 087 (formato do prazo +
  sino âmbar) e acrescentei os testes de foco (090) e de alvo de 40 px (084) — todos medindo o DOM real.

## Prova
- vermelho antes (SEM a mudança no componente, `git stash` só do `.tsx`):
  `npx vitest run src/components/tasks/__tests__/WorkItemCard.test.tsx` →
  `✕ 087 — o prazo de hoje sai no formato único...`, `✕ 090 — o card selecionado RECEBE FOCO...`,
  `✕ alvo ≥ 40 px: ...` e resumo `Tests 3 failed | 22 passed (25)`.
- verde depois (mesmo comando, mudança restaurada): `Tests 25 passed (25)`; e no diretório inteiro
  `npx vitest run src/components/tasks/` → `Test Files 23 passed (23); Tests 242 passed | 1 todo (243)`.
- token/classe medidos resolvidos: `--warning-text` está DEFINIDO em `src/styles/tokens.css`
  (linha 158, claro: `38 92% 30%`; linha 476, escuro: `40 91% 60%`). O Tailwind emite a regra do sino,
  conferida com `npx tailwindcss -c tailwind.config.ts -i src/index.css -o node_modules/.tw-check.css`:
  `.\[\&_svg\]\:text-\[hsl\(var\(--warning-text\)\)\] svg { color: hsl(var(--warning-text)); }`
  — `color` direto no `<svg>`, por isso o sino fica âmbar apesar de o texto do chip seguir neutro.
- medida do alvo: o teste lê o inset da CLASSE real (`/before:-inset-\[(\d+)px\]/` → 11) e calcula
  18 + 2·11 = 40 px, exigindo ≥ 40 — o número vem do componente, não é literal do teste.

## Pontos do revisor ([refazer 1])
- Ponto 1 (etapa 090 — seleção E foco): feito no card — o card selecionado recebe foco quando a seleção
  do painel muda, com teste (`090 — o card selecionado RECEBE FOCO...`, vermelho→verde). Declaro, sem
  ambiguidade, a ligação que NÃO é deste cartão: passar `isSelected`/`openPanel` nos chamadores
  (`TasksModule.tsx`, `BoardColumn.tsx`, `TasksListMode.tsx`) pertence aos cartões que possuem esses
  arquivos — **t_18834b02** (painel Detalhes, que altera `TasksModule.tsx`) e **t_a1c22e3a** (colunas do
  quadro, `BoardColumn.tsx`/`TasksBoardMode.tsx`). Neste cartão eu só podia tocar `WorkItemCard.tsx`, e
  ali a seleção já é lida das duas fontes (`isSelected` e `selectedId` do provider). Registrei isso em
  `kanban_comment`.
- Ponto 2 (alvo ≥ 40 px no checkbox): feito, ver `Prova` (18 px visível + pseudo-elemento de 11 px = 40 px,
  com teste que falha na base).
- Ponto 3 (asserção do prazo "Hoje, 14:00" e do sino âmbar): feito — o prazo é montado com o relógio do
  teste (hoje às 14h) e conferido por `toHaveTextContent('Hoje, 14:00')` (formato único de `workItemFormat`,
  T04); o sino é o `<svg>` do `remind-chip` com o wrapper âmbar.
- Ponto 4 (citar a linha da tabela da seção 3 do plano por etapa): planilha
  `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, seção 3 —
  imagem 05 em `:131` (`Tarefas/05.png`) e imagem 03 em `:108`. Linhas citadas por etapa:
  **084** `:140` ("Card: checkbox, título em 2 linhas, pílula de prioridade, \"Contato: Nome\", prazo") e
  `:108`/`:150` (regra D16: checkbox circular em todos, não o quadrado); **085** `:141` ("Urgente" ao lado
  do título); **086** `:142` (tag "Atrasada" com prazo em vermelho); **087** `:143` ("Lembrete no card
  (\"Hoje, 13:30\" com sino âmbar)"); **088** `:144` (card selecionado: descrição curta, "Prazo / Lembrete"
  em duas colunas); **089** `:145` (Aguardando: ponto âmbar + motivo); **090** `:144` (borda azul e alça ⠿).

## Arquivos da faixa dos pais (NÃO editados por este cartão)
O cartão manda, na DEPENDÊNCIA, trazer a faixa inteira dos pais (`git cherry-pick` de
`dia/2026-10-11..f1bd7fc85`). Por isso o diff tem arquivos que não são meus; abaixo a origem de cada um,
com o commit original e o SHA no meu branch:
- `src/hooks/tasks/workItem.types.ts` (subtítulo das colunas) ← pai **t_15507eb6**, original `8c4f970be`,
  aqui **ef329b26c**.
- `src/components/tasks/board/BoardColumn.tsx`, `board/TasksBoardMode.tsx`,
  `board/__tests__/BoardColumn.subtitulo-limite.test.tsx` ← pai **t_a1c22e3a** (subtítulo nas colunas,
  limite de Fazendo), original `3549a8720`, aqui **35e0b7473** + tipagem do mock `4eb3d2f9e`/**907596719**.
- `src/components/tasks/TasksModule.tsx`, `shared/ContactAvatar.tsx`, `shared/DateLabel.tsx`,
  `shared/PriorityPill.tsx`, `shared/StatusPill.tsx`, `shared/TaskCheckbox.tsx`,
  `shared/TasksUiContext.tsx`, `shared/tasksUi.ts`, `hooks/tasks/useMyWorkItems.ts`,
  `hooks/tasks/workItem.types.ts` (campo do painel) e `hooks/tasks/workItemFormat.ts` ← faixa dos pais
  **t_2456ca64** (base do painel) e formatos T04, trazida no commit **00d745edf**.
- `src/components/tasks/shared/WorkItemCard.tsx`, `__tests__/WorkItemCard.test.tsx`,
  `__tests__/TasksListMode.test.tsx`, `__tests__/agendaGroups.test.tsx` ← **este cartão** (etapas 084–090),
  original `7febb5f2e`, aqui **c27852825**, mais o meu **fe024462d** (refazer 1).
Nenhum desses arquivos de pai foi escrito por mim nesta rodada; o meu delta são só os 2 arquivos do
commit `fe024462d` (`git show --stat fe024462d`).

## Citações da seção 3 do plano (etapa → linha)
Plano: `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, seção 3
(imagem 05 em `:131` = `Tarefas/05.png`; imagem 03 em `:108`). Uma linha por etapa:
- 084 → `:140` ("Card: checkbox, título em 2 linhas, pílula de prioridade, \"Contato: Nome\", prazo") e
  `:108`/`:150` (regra D16: checkbox circular em todos).
- 085 → `:141` ("Urgente" ao lado do título).
- 086 → `:142` (tag "Atrasada" com prazo em vermelho).
- 087 → `:143` ("Lembrete no card (\"Hoje, 13:30\" com sino âmbar)").
- 088 → `:144` (card selecionado: descrição curta e "Prazo / Lembrete" em duas colunas).
- 089 → `:145` (Aguardando: ponto âmbar + motivo).
- 090 → `:144` (card selecionado: borda azul e alça ⠿).

## O que NÃO fiz e por quê
- Não alterei `RemindChip.tsx`: a cor do ícone é do primitivo T11, fora dos ARQUIVOS QUE PODE TOCAR deste
  cartão. O tom âmbar foi obtido dentro do `WorkItemCard` (wrapper) — se a regra for centralizada no
  primitivo, isso é um cartão do T11, não deste.
- Não mexi em `TasksModule.tsx`/`BoardColumn.tsx`/`TasksListMode.tsx` (ligação do Ponto 1) pelos mesmos
  limites de arquivo.
- Não conferi no navegador real (jsdom não calcula pseudo-elemento nem herança de cor): a prova do âmbar é
  a regra CSS emitida + token definido, e a do alvo é a classe real + medida de 18+2·11. Também não conferi
  temas/skins específicos — o par âmbar é o token `--warning-text`, que já tem valor no claro e no escuro.
