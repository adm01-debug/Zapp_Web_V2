Especialista: iris (area-front-componentes)

## Aviso de escopo (leia primeiro)
A banda do cartão pai `t_f79814ae` NÃO estava no meu workspace (o pai estava
integrado apenas na branch dele): trouxe por `git cherry-pick` os 10 commits de
`dia/2026-10-11..bdda26e52` (branch `v2/modal-nova-tarefa-cabecalho-titulo-conta-2610111655c231`,
o pai do T36), como o corpo do cartão manda. É por isso que o diff inclui os
arquivos novos do pai (NewTaskDialog, TaskTitleField, PrioritySegment, workItemPresets…):
eles NÃO são alterações minhas, são a base do meu cartão. Meu trabalho são os
arquivos novos `new-task/DueField|RemindField|CoherenceNotice|DestinationNote|camposDataHora`
+ o teste novo + a fiação em `NewTaskDialog.tsx`.

## O que mudou e por quê
- `src/components/tasks/shared/new-task/camposDataHora.tsx` (novo): tijolos
  comuns dos dois campos — linha de `<input>` de data/hora (com "Limpar", alvos
  de 40 px) e fileira de atalhos. A conversão passa por `localDateTime`
  (`comporLocal`/`diaLocal`/`horaLocal`), a regra única de data/hora do módulo.
- `src/components/tasks/shared/new-task/DueField.tsx` (novo): etapa 159 —
  "Prazo — Até quando concluir" com data, hora e Hoje / Amanhã / Próx. semana,
  permite limpar. Sem hora, grava 23:59 (convenção de "dia inteiro" já usada
  pelo QuickAdd). Cada atalho chama `duePresetISO` (função pura da etapa 161),
  nunca um `if` solto.
- `src/components/tasks/shared/new-task/RemindField.tsx` (novo): etapa 160 —
  "Lembrete — Quando você quer ser avisado" com data, hora e Em 1h / Amanhã, 9h
  / Próx. seg., 9h, permite limpar. Usa `remindPresetISO`.
- `src/components/tasks/shared/new-task/CoherenceNotice.tsx` (novo): etapa 163 —
  a frase de coerência prazo × lembrete. A decisão é do `checkRemindCoherence`
  (etapa 162): verde (`text-success`) quando o lembrete está no futuro e antes do
  prazo; âmbar (`text-[hsl(var(--warning-text))]`) quando o lembrete passou do
  prazo (com o atalho "Ajustar para 1 h antes do prazo") ou quando não há prazo;
  vermelho (`text-[hsl(var(--destructive-text))]`) quando o lembrete já passou.
  Sem lembrete, o aviso não aparece.
- `src/components/tasks/shared/new-task/DestinationNote.tsx` (novo): etapa 164 —
  "A tarefa será criada na Caixa de entrada." (D10). Texto, não campo: não há
  seletor de coluna/estado.
- `src/components/tasks/shared/NewTaskDialog.tsx`: fiação — estado `dueDate` e
  `remindAt`, os dois campos na ordem da imagem 04 (depois de Prioridade), o
  aviso de coerência e o destino. Único acréscimo de lógica: o handler
  `ajustarLembreteParaAntesDoPrazo` (prazo − 1 h).

## Critério de pronto, item a item
- 159 data, hora e Hoje/Amanhã/Próx. semana; permite limpar → DueField;
  provado por "atalho Hoje grava o preset… Limpar volta vazio".
- 160 data, hora e Em 1h/Amanhã, 9h/Próx. seg., 9h → RemindField; provado por
  "Amanhã, 9h grava 09:00 do dia seguinte e Em 1h usa a hora redonda".
- 163 aviso verde OK / âmbar / vermelho com "Ajustar para 1 h antes do prazo" →
  CoherenceNotice; provado por três casos (ok/after_due/in_past+no_due), com o
  clique em "Ajustar" levando o lembrete a 22:59 e o aviso a verde.
- 164 destino na Caixa de entrada → DestinationNote; provado por "destino escrito
  na Caixa de entrada e sem campo de estado" (nenhum input/select/textarea e
  nenhum `getByLabelText(/destino/i)`).
- Tokens `--warning-text`/`--destructive-text` herdados de DueChip/DateLabel e
  `text-success` para o verde → asseridos no className do aviso.
- 40 px de alvo → todo controle novo é `h-10` (data, hora, Limpar, atalhos,
  "Ajustar").
- Visibilidade do atalho escolhido → `aria-pressed` + `border-primary/50 bg-primary/15`.

## Prova
- vermelho antes (sem os componentes): `npx vitest run src/components/tasks/__tests__/novaTarefaPrazoLembrete.test.tsx` → `Test Files 1 failed (1) / Tests 10 failed (10)` (Unable to find element by `[data-testid="new-task-due-today"]`).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 10 passed (10)` (Duration 2.68s).
- sem regressão na vizinhança: `npx vitest run src/components/tasks/__tests__/ src/hooks/tasks/__tests__/` → `Test Files 34 passed (34); Tests 403 passed | 1 todo (404)`.
- lint limpo nos 7 arquivos: `npx eslint <os 7>` → saída vazia, exit 0.

## O que NÃO fiz e por quê
- Não toquei em `src/components/ui/*`, nem em hooks (prazo/lembrete usam as
  funções puras que o pai já entregou).
- Não fiz a coluna de prévia (165), a caixa informativa (166) nem o rodapé (167):
  são do cartão filho T37.
- Não liguei os campos ao insert: a criação otimista é do T37 — aqui só entram
  os valores que ele vai enviar.
- Não alterei nenhum teste existente.
