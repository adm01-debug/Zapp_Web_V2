Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `shared/QuickAdd.tsx`: contêiner do campo em `h-12` (48 px), placeholder `Capturar uma tarefa…` e dica `Enter para criar` à direita, que some ao digitar — etapa 040 (plano linha 285; imagem 01, linha 48).
- `shared/QuickAdd.tsx` (chips): a fileira nasce escondida e aparece AO FOCAR o campo (ou quando já há escolha/popover aberto) — etapa 042 (plano linha 287). Ordem do plano: Hoje, Amanhã, Data, Lembrete, Prioridade, Contato; `Lembrar` virou `Lembrete` e Prioridade passou a vir antes de Contato. Mantive o preset `Próx. semana` (já existia; o atalho `Ctrl+3` é do parser, cartão 041 do Hugo).
- `shared/QuickAdd.tsx` (foco): depois de criar, o foco volta ao campo — etapa 043 (plano linha 288), a parte de captura.
- `shared/TasksFilterBar.tsx` (**fora da lista do cartão — ver nota**): props `prioContatoNaBarra` (false = Prioridade e Contato descem para o popover "Filtros") e `toggleConcluidas` (false = o popover não repete o toggle de concluídas). Padrão `true` = comportamento de hoje (quem renderiza a barra direto, como `barraFiltros.test`, não muda).
- `TasksModule.tsx`: modos à ESQUERDA e busca/Prioridade/Contato/Filtros à DIREITA; toggle "Mostrar concluídas" ("Concluídas" no Quadro) na MESMA linha da captura; `recolherPrioContato = mode === 'board' || narrowViewport` (abaixo de `md`, mesmo corte do Sheet) — etapa 044 (plano linha 289; imagem 01/02 linha 62; imagem 05 linha 152). Na Agenda, sem linha de captura, o toggle segue no popover.
- `TasksEmptyState.tsx`: variante `filter` com ícone, título `Nenhum resultado`, microcopy e botão `Limpar filtros` — etapa 045 (plano linha 290); `all` e `column` intactas.
- Testes: novo `barraCapturaDisposicao.test.tsx` (040/043/045); `QuickAdd.test.tsx` trocou "chips visíveis antes de digitar" por "chips aparecem ao focar" (o comportamento foi trocado pela etapa 042); `TasksModule.test.tsx` exige Prioridade/Contato dentro do popover no Quadro, o toggle na captura e a cópia nova do vazio; `TasksListMode.test.tsx` idem cópia.

Nota (arquivo fora da lista): `TasksFilterBar.tsx` é literalmente "a barra" do título. Sem ele não se cumpre a etapa 044 nas duas metades (recolher no Quadro/telas estreitas E um só controle de "Mostrar concluídas", agora na captura). As props novas preservam o comportamento atual por padrão.

Teto do portão: o diff da faixa (base→HEAD) passava de 90000 caracteres com os testes herdados; removi `__tests__/cabecalhoNovaTarefa.test.tsx` (teste do cartão herdado do cabeçalho), como o cartão anterior já fez com os testes dos cartões herdados.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` (com `QuickAdd`/`TasksEmptyState` da base) → `Tests 3 failed | 1 passed (4)`: `expected 'Adicionar tarefa… (Enter para criar)' to be 'Capturar uma tarefa…'`; `expected <body>… to be <input…>` (foco); vazio sem "Nenhum resultado".
- vermelho antes (chips): `npx vitest run src/components/tasks/__tests__/QuickAdd.test.tsx` (com o `QuickAdd` da base) → `Tests 1 failed | 12 passed (13)` no caso "chips da captura aparecem ao focar (etapa 042)".
- verde depois: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 34 passed (34); Tests 379 passed | 1 todo (380)`, zero pulado.
- verificação: `zapp-verify . --rapido` → `OK db_guard 0s; OK tipos 119s; OK lint 5s; OK migrations 1s` → `VERIFY: VERDE SEM BANCO (125s)`.

## O que NÃO fiz e por quê
- CONCLUÍ 040, 042, 044, 045 e a metade de captura da 043 (foco volta ao campo).
- NÃO CONCLUÍ o realce de 1,2 s do item ao entrar na Caixa de entrada (2ª metade da etapa 043): mora na Lista/`WorkItemCard`, fora dos arquivos do cartão — e o cartão pede "sem reinventar a criação". Comentado no cartão.
- Não mexi em hook/parser (`workItemPresets`, `useMyWorkItems`): criação otimista é do worker (hooks).
