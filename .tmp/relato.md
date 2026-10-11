Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/QuickAdd.tsx`: contêiner do campo em `h-12` (48 px), placeholder `Capturar uma tarefa…` e dica `Enter para criar` à direita, que some ao digitar — etapa 040 (plano linha 285; tabela da imagem 01, linha 48).
- `QuickAdd.tsx` (chips): a fileira nasce escondida e aparece AO FOCAR o campo (ou quando já há escolha/popover aberto) — etapa 042 (plano linha 287). Ordem do plano: Hoje, Amanhã, Data, Lembrete, Prioridade, Contato; o chip `Lembrar` passou a `Lembrete` e Prioridade passou a vir ANTES de Contato. Mantive o preset `Próx. semana` (já existia e o atalho `Ctrl+3` é do parser, cartão 041 do Hugo) — os seis rótulos do plano estão lá, na ordem.
- `QuickAdd.tsx` (foco): depois de criar, o foco volta ao campo — etapa 043 (plano linha 288), a parte de captura do cartão.
- `src/components/tasks/shared/TasksFilterBar.tsx` (**arquivo fora da lista do cartão — ver nota**): props `prioContatoNaBarra` (false = Prioridade e Contato descem para dentro do popover "Filtros") e `toggleConcluidas` (false = o popover não repete o toggle de concluídas). Padrão `true` = comportamento de hoje, então quem renderiza a barra direto (barraFiltros.test) não muda.
- `src/components/tasks/TasksModule.tsx`: modos à ESQUERDA e busca/Prioridade/Contato/Filtros à DIREITA; o toggle "Mostrar concluídas" (no Quadro, "Concluídas") na MESMA linha da captura; e `recolherPrioContato = mode === 'board' || narrowViewport` (abaixo de `md`, o mesmo corte do Sheet) — etapa 044 (plano linha 289; imagem 01/02 linha 62; imagem 05 linha 152). Na Agenda, que não tem linha de captura, o toggle continua no popover.
- `src/components/tasks/TasksEmptyState.tsx`: variante `filter` com ícone, título `Nenhum resultado`, microcopy e botão `Limpar filtros` — etapa 045 (plano linha 290). As variantes `all` e `column` não mudaram.
- Testes: novo `__tests__/barraCapturaDisposicao.test.tsx` (040, 043, 045); `QuickAdd.test.tsx` trocou o teste "chips visíveis antes de digitar" pelo "chips aparecem ao focar" (o comportamento foi trocado pela etapa 042); `TasksModule.test.tsx` passou a exigir Prioridade/Contato DENTRO do popover no Quadro e o toggle na linha da captura, e a cópia nova do vazio; `TasksListMode.test.tsx` idem cópia.

Nota (arquivo fora da lista): `TasksFilterBar.tsx` é literalmente "a barra" do título do cartão. Sem ele é impossível cumprir a etapa 044 nas duas metades (recolher Prioridade/Contato no Quadro/telas estreitas E ter um só controle de "Mostrar concluídas" — o toggle na captura). As duas props novas entram com padrão que preserva o comportamento atual.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` (com `QuickAdd`/`TasksEmptyState` da base) → `Tests 3 failed | 1 passed (4)` — `expected 'Adicionar tarefa… (Enter para criar)' to be 'Capturar uma tarefa…'`; `expected <body>… to be <input…>` (foco); vazio sem "Nenhum resultado".
- vermelho antes (chips): `npx vitest run src/components/tasks/__tests__/QuickAdd.test.tsx` (com o `QuickAdd` da base) → `Tests 1 failed | 12 passed (13)` — `os chips da captura aparecem ao focar o campo (etapa 042)`.
- verde depois: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 34 passed (34); Tests 379 passed | 1 todo (380)`, zero pulado.
- verificação: `zapp-verify . --rapido` → `OK db_guard 0s; OK tipos 119s; OK lint 5s; OK migrations 1s` → `VERIFY: VERDE SEM BANCO (125s)`.

## O que NÃO fiz e por quê
- CONCLUÍ as etapas 040, 042, 044 e 045 e a metade de captura da 043 (o foco volta ao campo).
- NÃO CONCLUÍ: o realce de 1,2 s do item ao entrar na Caixa de entrada (2ª metade da etapa 043). Ele mora na Lista/`WorkItemCard`, que não estão nos arquivos do cartão — e o próprio cartão pede "sem reinventar a criação". Deixado como comentário no cartão.
- Não mexi em hook/parser (`workItemPresets`, `useMyWorkItems`): criação otimista é do worker (hooks) — etapa 043 é do Hugo nessa parte.
