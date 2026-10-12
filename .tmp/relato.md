Especialista: iris (area-front-componentes)

## Reentrega como sucessor (correção do integrar)
Rebase `git rebase --onto bdda26e52 27fbdc580`: a branch agora desce do tip do pai
`t_f79814ae` (`bdda26e52`) e o patch sucessor tem só os arquivos deste cartão
(nenhum conteúdo novo acrescentado; os cherry-picks duplicados saíram).

## O que mudou e por quê
Etapas 159, 160, 163 e 164 do plano: o modal "Nova tarefa" ganha Prazo, Lembrete,
a mensagem de coerência e o destino escrito.

- `src/components/tasks/shared/new-task/camposDataHora.tsx` (novo): tijolos comuns
  `DateTimeRow` (date + time, altura 40 px, botão "Limpar") e `PresetChips`
  (atalhos de 40 px, `aria-pressed`). Hora só liga depois que há dia; sem hora
  escolhida grava o padrão do campo (prazo 23:59, lembrete 09:00). Zero segundos
  via `comporLocal(diaLocal(iso), horaLocal(iso))` e `localDateTime.ts`.
- `.../new-task/DueField.tsx` (novo, etapa 159): "Prazo — Até quando concluir"
  com data, hora e atalhos Hoje / Amanhã / Próx. semana (`duePresetISO`).
- `.../new-task/RemindField.tsx` (novo, etapa 160): "Lembrete — Quando você quer
  ser avisado" com atalhos Em 1h / Amanhã, 9h / Próx. seg., 9h (`remindPresetISO`).
- `.../new-task/CoherenceNotice.tsx` (novo, etapa 163): usa `checkRemindCoherence`
  (regra única, do pai) e pinta o par de TEXTO do estado — verde `text-success`,
  âmbar `text-[hsl(var(--warning-text))]`, vermelho
  `text-[hsl(var(--destructive-text))]` — com botão "Ajustar para 1 h antes do
  prazo" no aviso âmbar e `role="status"`.
- `.../new-task/DestinationNote.tsx` (novo, etapa 164): "A tarefa será criada na
  Caixa de entrada." — destino fixo, texto e ícone, não editável.
- `src/components/tasks/shared/NewTaskDialog.tsx` (editado): só liga os quatro
  blocos depois de Prioridade e guarda `dueDate`, `remindAt` e o ajuste.

Sem vocabulário novo, sem filtro, sem rodapé/prévia (etapas 165–167, cartão
filho). Nenhuma animação: nada de `prefers-reduced-motion`.

## Prova
- vermelho antes (fiação do pai restaurada por checkout temporário de
  `NewTaskDialog.tsx` em `bdda26e52`, árvore restaurada em seguida):
  `npx vitest run src/components/tasks/__tests__/novaTarefaPrazoLembrete.test.tsx`
  → `Failed Tests 10` (`Unable to find an element by:
  [data-testid="new-task-due-today"]` e demais testIDs).
- verde depois:
  `npx vitest run src/components/tasks/__tests__/novaTarefaPrazoLembrete.test.tsx src/components/tasks/__tests__/newTaskDialog.test.tsx`
  → `Test Files  2 passed (2); Tests  17 passed (17)`.
- Os testes provam pela TELA (componente real): rótulos, presets com hora certa,
  aviso âmbar com botão de ajuste que vira verde, vermelho no passado, destino
  não editável e `vitest-axe` sem violação; o teste do pai segue verde (sem
  regressão no modal base).

## O que NÃO fiz e por quê
- Não criei regra de data: tudo vem de `workItemPresets.ts` e `localDateTime.ts`.
- Não mexi em `src/hooks/**`, `src/components/ui/**`, `TasksModule.tsx` nem no
  rodapé/prévia — fora da fatia.
