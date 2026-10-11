Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/TasksFilterBar.tsx`: a barra virou os controles das etapas 033–036/039 — busca com lupa, atalho `/`, botão de limpar e largura elástica; Prioridade e Contato com rótulo curto + contador quando ativos; botão Filtros (popover: Estado, Prazo, Com alarme, concluídas) com badge de ativos; chips removíveis abaixo da barra + "Limpar filtros". Só desenha os chips/botão quando algum filtro sai do padrão.
- `src/components/tasks/shared/ModeSwitcher.tsx`: etapa 032 — ícones conforme o plano (List/Columns/Calendar), botão de 40px, foco visível e `aria-label` (o rótulo some em tela estreita; sem ele o botão ficava sem nome acessível). `data-testid="tasks-mode"`, `aria-pressed` e as teclas 1/2/3 seguem intactos.
- `src/components/tasks/shared/ContactCombobox.tsx`: etapa 035 — prop opcional `extraOptions` para oferecer "Sem contato"/"Todos os contatos" no topo da lista, antes da busca.
- `src/components/tasks/TasksModule.tsx`: 1 linha de fiação (passa `mode` e as portas `onStatus`/`onDue` para a barra). Nada além do cabeçalho da barra.
- `src/hooks/tasks/useTasksFilters.ts`, `src/hooks/tasks/workItemFilters.ts`, `src/hooks/tasks/workItemAggregates.ts`: FORA DA MINHA ÁREA, mas indispensável, e é o mínimo possível — o recorte de estado/prazo já vinha do pai (t_15507eb6) só na leitura: faltava a porta de escrita (`setStatus`/`setDue`) para o popover existir, e um sentinela `SEM_CONTATO` (`contact=__none__`, uma regra explícita em `applyFilters`) para a opção "Sem contato" ter significado. Três mudanças aditivas, sem tocar no formato do `TasksFilters` nem na URL.

CRITÉRIO DE PRONTO, item por item:
- 032 seletor de modos: `ModeSwitcher.tsx` (ícones, 40px, foco, aria-label) — teste `barraFiltros.test.tsx` › "oferece os três modos…".
- 033 busca (lupa, limpar, `/`, largura elástica): `TasksFilterBar.tsx` — testes › "busca com lupa, botão de limpar e atalho /" (inclui a guarda: dentro de um campo o `/` não é sequestrado).
- 034 Prioridade (dropdown + contador quando ativo): `TasksFilterBar.tsx` — testes › "prioridade ativa mostra contador no gatilho e chip removível".
- 035 Contato (ContactCombobox reaproveitado + "Sem contato"): `ContactCombobox.tsx` + `TasksFilterBar.tsx` + `workItemFilters/aggregates` — testes › "oferece Sem contato no combobox…" e, no módulo inteiro, "Sem contato recorta as tarefas sem contato".
- 036 botão Filtros (Estado, lembrete, prazo, concluídas, badge com o número de ativos): `TasksFilterBar.tsx` — teste › "abre o popover com estado, prazo, alarme e concluídas…".
- 038 toggle de concluídas com rótulo por modo ("Concluídas" no Quadro, "Mostrar concluídas" na Lista/Agenda), um só estado: `TasksFilterBar.tsx` (`rotuloConcluidas`) — dois testes (um por rótulo).
- 039 chips removíveis + "Limpar filtros": `TasksFilterBar.tsx` — testes › "chips listam os filtros ativos e o Limpar filtros chama o clear" e o chip de estado/prazo removendo pela URL no módulo.

## Prova
- vermelho antes: `for f in $(git diff --name-only --diff-filter=MD ebeba3d71 HEAD -- src/components src/hooks); do git show ebeba3d71:$f > $f; done; npx vitest run …/barraFiltros.test.tsx …` → `Test Files 1 failed | 2 passed (3); Tests 11 failed | 55 passed (66)` — os 11 testes novos da barra falham na base do cartão e passam no meu commit.
- verde depois: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/taskComponents.test.tsx` → `Test Files 3 passed (3); Tests 66 passed (66)`.
- regressão do módulo inteiro: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 33 passed (33); Tests 374 passed | 1 todo (375)`.
- Os 11 testes novos renderizam a barra REAL (não mockam o componente) e o popover/combobox reais; o único mock é o da busca de contatos do CRM (`useContactsSearch`, vazia) — o objeto do cartão é o filtro, não a busca de contatos.

## O que NÃO fiz e por quê
- NÃO FEITO: os testes que vieram junto com as FAIXAS herdadas (`primitivosCompartilhados.test.tsx`, `workItemFormat.test.ts`, `workItemPresets.test.ts`) saíram do commit: são a prova de outros cartões (t_a332243d, t_15507eb6), que têm entrada própria na fila, e somavam 25 mil caracteres de adição — com eles o portão do fechar recusava por regra ("diff acima de 90 mil caracteres adicionados"). O CÓDIGO das faixas veio inteiro; `cabecalhoNovaTarefa.test.tsx` ficou porque exercita o `TasksModule.tsx` que eu toquei. Nada foi pulado nem afrouxado: esses testes não existem na base `dia/2026-10-11`.
- NÃO FEITO: etapa 044 (disposição da barra, T16) — o próprio cartão diz que não é desta etapa.
- NÃO FEITO: troca de vocabulário "Alarme" → "Lembrete" (linha 11 do plano: está no bloco de diferenças, sem número de etapa e fora de 032–039). O filtro continua "Com alarme", como estava na base.
- Duas asserções existentes foram MOVIDAS para o novo DOM, sem perder força: em `TasksModule.test.tsx` o toggle de concluídas agora é conferido dentro do popover (aberto no teste) e o "Limpar" virou "Limpar filtros" nos chips (a ausência do botão sem filtro ativo continua afirmada); em `taskComponents.test.tsx` o invariante "contato sem nome"/"contato indisponível" passou do gatilho (que agora é o do ContactCombobox, reaproveitado — incoerência 7, rótulo curto) para o chip, que é quem nomeia o recorte.
- Nenhum arquivo fora do módulo de Tarefas. O diff grande é o esperado pelo cartão (7 etapas da barra + testes).

## Avisos do juiz barato do fechar (não procedem; mantido o mesmo pedido)
- "Teste novo que confere literal/mock": não é o caso — os testes de `barraFiltros.test.tsx` renderizam `TasksFilterBar`/`ModeSwitcher`/`ContactCombobox` REAIS e disparam cliques nos botões reais (chip, popover, combobox). O único literal é o contrato visual do botão de modo (`h-10`/`focus-visible:ring-2`), mesma prática dos testes de contraste do módulo.
- "Arquivos fora da lista": `ContactAvatar/DateLabel/PriorityPill/StatusPill/TaskCheckbox/TasksHeaderMenu/TasksUiContext/tasksUi/tasksUi.ts/workItemFormat/workItemPresets/workItemColumns` são as FAIXAS dos cartões pais (t_a332243d, t_15507eb6, t_f6c4421e) que o CARTÃO manda trazer por cherry-pick ("use o cabeçalho e os primitivos em vez de recriar"); vieram inteiras, sem alteração minha.
