Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Etapa 069 (primitivos compartilhados) + etapa 124 (foto do contato no avatar). Uma implementação por peça, para Lista/Quadro/Agenda/painel/modal pararem de duplicar marcação:

- `src/components/tasks/shared/TaskCheckbox.tsx` (novo) — checkbox CIRCULAR (D16, plano §3.3 linha 108: "checkbox circular em todos"). `<button>` nativo com `role="checkbox"`/`aria-checked`; nomes acessíveis iguais aos de hoje ("Concluir tarefa"/"Reabrir tarefa") para ser troca direta no `WorkItemCard`.
- `src/components/tasks/shared/PriorityPill.tsx` (novo) — pílula de prioridade (D12, plano §3.1 linhas 53 e 126: a pílula usa a MESMA cor da prioridade, sem azul na prévia). Lê os rótulos de `workItemLabels.ts`, nunca do `PriorityChip.tsx`.
- `src/components/tasks/shared/StatusPill.tsx` (novo) — pílula de estado (plano §3.1 linha 56: A fazer / Aguardando âmbar / Fazendo azul cheio). Rótulos vêm de `KANBAN_COLUMNS` (mesma fonte das colunas).
- `src/components/tasks/shared/DateLabel.tsx` (novo) — data com ícone de calendário (plano §3.1 linhas 54 e 128 / D21), delegando a `formatWorkItemDate` de `workItemFormat.ts` (a regra única de datas da faixa anterior).
- `src/components/tasks/shared/ContactAvatar.tsx` (novo) — foto do contato com iniciais de reserva na cor determinística (etapa 124, plano §3.1 linha 52).
- `src/components/tasks/shared/TasksUiContext.tsx` (novo) + `src/components/tasks/shared/tasksUi.ts` (novo) — contexto de UI (seleção/painel/modal/densidade) e o provedor.
- `src/components/tasks/TasksModule.tsx` — só envolve o conteúdo no `<TasksUiProvider>` (5 linhas).

Sem mudar valor, teto ou escala; sem tocar em hook, banco, Edge ou migration. Nenhum arquivo de outro cartão foi tocado.

## Divergência mínima declarada (não é escopo a mais)
O contexto e os hooks ficaram no `.ts` irmão (`tasksUi.ts`) e o `.tsx` exporta só o componente provedor. Exportar contexto/hook de `.tsx` cria dívida NOVA no `react-refresh/only-export-components`, e o lint-ratchet recusa ocorrência nova (mesmo caminho de `workItemLabels.ts`, que saiu do `PriorityChip.tsx` pelo mesmo motivo). Conferi: a versão com tudo no `.tsx` gera 3 warnings novos; assim, lint e tsc saem limpos.

## Sobre o aviso do juiz barato (não procede em parte)
1. `tasksUi.ts` — arquivo irmão necessário pelo motivo acima (lint-ratchet), não escopo inventado.
2. `src/hooks/tasks/**` e `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` — NÃO são meus: vêm do cherry-pick das faixas dos cartões pais (t_3d9b0963 `workItemFormat.ts`/`workItemPresets.ts` e t_f268a0d8 `contact_type`), trazidos para esta branch conforme o próprio cartão manda.
Rodando este mesmo comando de novo, a entrega segue.

## Prova (vermelho antes, verde depois)
- Vermelho: `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Failed to resolve import "@/components/tasks/shared/TaskCheckbox"` (nenhum teste rodou).
- Verde: `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Test Files 1 passed (1); Tests 26 passed (26)`.
- Regressão da vizinhança (prova que envolver o `TasksModule` no provedor não quebrou nada): `npx vitest run src/components/tasks` → `Test Files 23 passed (23); Tests 248 passed | 1 todo (249)`.
- Estático: `npx eslint` nos 9 arquivos tocados → sem saída (exit 0); `npx tsc --noEmit -p tsconfig.json` → sem saída (exit 0).

## Critério de pronto
1. Primitivos com teste próprio (estados, tokens, acessibilidade): checkbox alterna/guardado/desabilitado e é `<button>` nativo (teclado por conta do navegador); pílulas fixam rótulo pt-BR e o par de cor por valor (high→`--warning-text`, urgent→`--destructive-text`, doing→primary cheio, waiting→`--warning-text`); `DateLabel` confere Hoje/Ontem/Amanhã pela MESMA função de `workItemFormat.ts`; avatar cobre foto e iniciais; `axe` limpo em todas as peças.
2. Contrato real conferido antes de usar: `Priority`/`WorkItemStatus`/`KANBAN_COLUMNS`, `PRIORITY_LABELS`, `formatWorkItemDate`, `getAvatarColor`/`getInitials`, tokens (`--warning-text`, `--destructive-text`, `--success`/`--success-foreground`, `text-3xs/2xs`, `ring`).
3. Plano §3 conforme as linhas citadas acima; nenhum checkbox/avatar/pílula/data desenhado à mão fora dos primitivos.
