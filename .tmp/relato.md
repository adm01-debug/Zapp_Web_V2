Especialista: iris (area-front-componentes)

## Banda do pai (cherry-pick declarado — não é trabalho deste cartão)
Este cartão é filho de `t_f79814ae` (feat(tarefas): modal Nova tarefa com cabecalho,
titulo, contato e prioridade), que fechou às 17:12 mas ainda NÃO foi integrado em
`dia/2026-10-11`. Como o modal só existe na banda do pai, trouxe a banda inteira por
`git cherry-pick` (instrução do cartão), na ordem:

  ab51f9784 feat(hooks): tarefas trazem o tipo do contato (Cliente) junto da foto
  87bcca0b7 feat(hooks): regra unica de datas e presets de prazo/lembrete do modulo de Tarefas
  751099f89 feat(tarefas): primitivos compartilhados e contexto de UI do modulo de Tarefas
  136965ab8 chore(tarefas): relato dos primitivos compartilhados e do contexto de UI
  c83c40490 chore(tarefas): contexto de UI no ts irmao e relato do cartao
  e7eeffa20 feat(tarefas): cabecalho com Nova tarefa, atalho N e menu do modulo
  2a2debc60 chore(tarefas): relato do cartao do cabecalho de tarefas
  c17bdd86c feat(tarefas): modal Nova tarefa com cabecalho, titulo, contato e prioridade
  dfc91daca chore(tarefas): relato do cartao do modal Nova tarefa
  bdda26e52 chore(tarefas): relato do cartao do modal Nova tarefa

A banda soma 1.940 linhas adicionadas (~87,6 mil caracteres), ela sozinha já quase
toca o teto de 90.000 caracteres do portão. As 622 linhas que EU acrescento
(~17,7 mil caracteres) fazem o diff contra `dia/2026-10-11` chegar a ~105 mil.
Por isso o recado do fechar: "diff tem 105949 caracteres ADICIONADOS ... acima de 90000".
Nada aqui é trabalho alheio nem gerado; é a banda obrigatória + a fatia do cartão.
Se o portão não descontar a banda, a saída é integrar o pai em `dia/2026-10-11`
antes deste cartão (aí o diff cai para ~17,7 mil) — registrei em comentário.

## O que mudou e por quê
Etapas 159, 160, 163 e 164 do plano (linhas 439–442; imagem 04, seção 3.4): o modal
"Nova tarefa" ganha Prazo, Lembrete, a mensagem de coerência e o destino escrito.

- `src/components/tasks/shared/new-task/camposDataHora.tsx` (novo): os dois tijolos
  comuns dos campos de data/hora — `DateTimeRow` (`<input type="date">` +
  `<input type="time">`, altura 40 px, botão "Limpar") e `PresetChips` (atalhos de
  40 px, `aria-pressed`, destacados em `primary` quando valem). O campo de hora só
  liga depois que há dia; sem hora escolhida grava a hora-padrão do campo
  (prazo 23:59, lembrete 09:00). Ponto zero-segundos via
  `comporLocal(diaLocal(iso), horaLocal(iso))` e `localDateTime.ts` (R2-MOD-050):
  nada de hora com segundos.
- `.../new-task/DueField.tsx` (novo, etapa 159): "Prazo — Até quando concluir" com
  data, hora, atalhos Hoje / Amanhã / Próx. semana (`duePresetISO`) e limpar.
- `.../new-task/RemindField.tsx` (novo, etapa 160): "Lembrete — Quando você quer ser
  avisado" com data, hora, atalhos Em 1h / Amanhã, 9h / Próx. seg., 9h
  (`remindPresetISO`) e limpar.
- `.../new-task/CoherenceNotice.tsx` (novo, etapa 163): usa `checkRemindCoherence`
  (uma regra só, do pai) e pinta o par de TEXTO do estado — verde `text-success`
  ("Lembrete programado para antes do prazo."), âmbar
  `text-[hsl(var(--warning-text))]` (lembrete depois do prazo; sem prazo) e vermelho
  `text-[hsl(var(--destructive-text))]` (lembrete no passado). No aviso âmbar de
  "depois do prazo" aparece o botão "Ajustar para 1 h antes do prazo". `role="status"`
  para o leitor de tela ouvir a mudança de estado.
- `.../new-task/DestinationNote.tsx` (novo, etapa 164): "A tarefa será criada na
  Caixa de entrada." — destino fixo (D10), texto e ícone, não campo editável.
- `src/components/tasks/shared/NewTaskDialog.tsx` (editado): só liga os quatro
  blocos depois de Prioridade e guarda os dois estados novos (`dueDate`, `remindAt`)
  e o ajuste do lembrete.

Sem vocabulário novo, sem filtro, sem verificação, sem recomendação e sem
responsividade (é dos cartões vizinhos). Não mexi no rodapé, na prévia nem na caixa
informativa (etapas 165–167, cartão filho). Nenhuma animação: nada a respeitar em
`prefers-reduced-motion`.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/novaTarefaPrazoLembrete.test.tsx`
  → `Unable to find an element by: [data-testid="new-task-due-today"]` (10 de 10 falham;
  os testIDs ainda não existiam).
- verde depois: `npx vitest run src/components/tasks/__tests__/novaTarefaPrazoLembrete.test.tsx`
  → `Test Files  1 passed (1); Tests  10 passed (10)`.
- sem regressão na vizinhança:
  `npx vitest run src/components/tasks/__tests__/ src/hooks/tasks/__tests__/`
  → `Test Files  34 passed (34); Tests  403 passed | 1 todo (404)`.
- `npx eslint` nos 7 arquivos do cartão → exit 0, 0 avisos (o ratchet de lint
  baseline=0 continua limpo).

Os 10 testes provam, pela TELA (componente real, nada de mock de resultado):
1. o Prazo traz o rótulo "Prazo — Até quando concluir", o campo de data e a hora
   desligada antes de haver dia;
2. "Hoje" grava o preset com hora 23:59 e o campo de hora liga;
3. trocar a hora mantém o dia; "Limpar" esvazia e desliga a hora de novo;
4. o Lembrete traz "Quando você quer ser avisado" e os atalhos Em 1h / Amanhã, 9h /
   Próx. seg., 9h — "Amanhã, 9h" grava 09:00;
5. lembrete depois do prazo → aviso âmbar com o texto e o botão "Ajustar…";
   clicar nele deixa o lembrete 1 h antes do prazo e o aviso vira o verde de coerência;
6. lembrete no passado → aviso vermelho; lembrete sem prazo → o aviso de "sem prazo";
7. o destino está escrito e não é editável;
8. `vitest-axe` no modal aberto → nenhuma violação.
Além do comportamento, os testes 5/6 conferem que a cor vem do token de TEXTO do
estado (`--warning-text` / `--destructive-text`, e `text-success` no ok) — o par que
fecha o contraste AA, em vez do token cru de preenchimento.

## O que NÃO fiz e por quê
- Não criei regra de data/dedução: tudo vem de `workItemPresets.ts` e
  `localDateTime.ts` (do pai). Nenhum `if` solto de data.
- Não mexi em `src/hooks/**`, `src/components/ui/**`, `TasksModule.tsx` nem no
  rodapé/prévia do modal — fora da minha fatia.
- Não calculei nenhum número à mão: esta seção sai do bloco FATOS do fechar.

## NÃO CONCLUÍ (se o portão reincidir em tamanho)
Só o portão de tamanho impede o FECHADO aqui. O código, a prova e o diff estão
prontos no commit `bc1cb38c1` da branch
`v2/modal-nova-tarefa-prazo-lembrete-coerenc-26101117161e41`. O que falta é o pai
(`t_f79814ae`) entrar em `dia/2026-10-11` — aí o diff deste cartão são só as minhas
~622 linhas e o teto não é tocado. Peço a decisão do integrador/coordenador.
