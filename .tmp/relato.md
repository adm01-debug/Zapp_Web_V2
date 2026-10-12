Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` (novo, único arquivo do diff): testes de TECLADO da barra (Etapa 047 do plano, seção 8-bis). A tecla entra pelo `keydown` de janela com o registry global de verdade montado (`Registry` + `TasksModule` + `useTasksFilters` + URL), então cada caso percorre tecla → registry → evento `tasks-shortcut` → módulo, como na app:
  - `/` leva o foco à busca (e NÃO dispara com o foco dentro de um campo de texto);
  - `2`/`3`/`1` acionam Quadro, Agenda e Lista, com o estado resultante no `data-mode` e no `localStorage`;
  - trocar o modo pela tecla não desmonta a barra nem perde o texto digitado e sai da MESMA consulta da carga inicial;
  - Enter confirma a ação do elemento focado: recorte da busca (texto preservado), item destacado do Select de Prioridade (Radix dirigido por teclado) e item do popover de Contato (cmdk);
  - ordem de foco da barra é a ordem de documento dos focáveis (esquerda→direita), nenhum `tabindex` positivo e o foco SAI da barra no fim;
  - Escape fecha o popover de Contato e devolve o foco ao gatilho.
- Nada de produção foi alterado (o `git diff` do commit tem só o arquivo de teste); nenhum teste existente foi tocado, pulado ou afrouxado, e nenhum `it.todo` foi criado.

Linha da tabela da seção 8-bis (plano 2026-10-11) por atalho, como o cartão pede:
- `/` (busca) — seção 8-bis, cabeçalho na linha 510; o atalho é do registro global do módulo (Etapa 77) e o caso só prova o foco/recorte de TELA (Fase F, linha 524).
- `1`/`2`/`3` (modo) — linha 516 (G-5): "Etapa 041 mantém só os atalhos 1/2 e `!`". Os 1/2/3 cobertos aqui são os do MODO, com escopo `tasks`; NÃO são os do campo de captura (Etapa 41, `ctrl+1/2/3` dentro do QuickAdd) e nenhum parser de linguagem natural foi criado ou testado.
- troca de modo sem consulta nova — linha 520 (B13): "Uma query só para os três modos"; o caso conta a fronteira do cliente Supabase falso.
- Enter (busca, item de dropdown e item de popover) e ordem de foco/Escape — linha 510 e linha 524 (Fase F, filtro é recorte de TELA): o texto e o recorte sobrevivem à troca de modo e ao Enter.

## Prova (vermelho antes, verde depois — produção mutada e restaurada, `git diff` de produção vazio no fim)
- `/` foca a busca: removendo o atalho `tasks-search` de `defaultShortcuts.ts` → `× / leva o foco à busca quando o foco não está num campo de texto` / `AssertionError: expected <input …> to be <body><div>…`.
- 1/2/3: `alternateKeys: []` (só `1`) → `× as teclas 2, 3 e 1 acionam Quadro, Agenda e Lista` / `AssertionError: expected 'board' to be 'agenda'`; e `setMode('list')` fixo no `TasksModule` → `AssertionError: expected 'list' to be 'board'`.
- guarda de input: desligada em `useGlobalKeyboardShortcuts.ts` → `× / NÃO dispara com o foco dentro de um campo de texto` / `expected <input> to be <input>` e `× 2 digitado DENTRO da busca não troca o modo` / `expected 'board' to be 'list'`.
- Enter no Select: `onValueChange` do `Select` virando no-op → `× Enter no Select de Prioridade escolhe a opção destacada` / `AssertionError: expected 'Todas as prioridades' to contain 'Urgente'`.
- Enter no popover: `onSelect` do `CommandItem` virando no-op → `× Enter no item do popover de Contato marca o contato` / `expected 'Todos os contatos' to match /Ana Souza/`.
- ordem de foco: `tabIndex={1}` no switch "Com alarme" → `× a ordem de foco da barra vai da esquerda para a direita, sem armadilha` / `AssertionError: expected false to be true`.
- busca e popover (fiação real): `onChange` do campo de busca e `onOpenChange` do popover de Contato virando no-op → 4 casos vermelhos, incluindo `× Enter na busca aplica o recorte e mantém o texto digitado` e `× Escape fecha o popover de Contato e devolve o foco ao gatilho`.
- verde: `npx vitest run src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` → `Test Files 1 passed (1) / Tests 10 passed (10)`. Rodado junto do vizinho de área (sem alterá-lo): `Test Files 2 passed (2) / Tests 13 passed (13)`. `npx eslint` no arquivo novo: sem aviso.

## Dependência e o que NÃO fiz
- Depende da Etapa 046 (`t_19d2fd12`): o arquivo `TasksFilterBar.test.tsx` dela ainda NÃO está no meu tronco (`dia/2026-10-12`). Para não arrastar arquivo de outro cartão para o meu diff (armadilha 1 da skill `armadilhas-workertestes`), escrevi o harness no mesmo padrão e sobre os mesmos mocks compartilhados (`@/test/mocks/tarefas`), em vez de fazer cherry-pick da entrega alheia. A extensão literal daquele arquivo fica para o integrador/`[refazer]`, se o cartão exigir.
- Não mexi em produção (nem na guarda, nem nos atalhos, nem na barra): as mutações acima foram revertidas e o `git diff` de produção está vazio — o único arquivo do commit é o teste novo.
- Não testei o campo de captura da Etapa 041 (`ctrl+1/2/3`, `!`): é assunto do parser do QuickAdd (decisão G-5, linha 516), não da barra de ferramentas.
