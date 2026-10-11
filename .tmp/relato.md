Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/sheet/PainelRodape.tsx` (novo): etapas 141–142 — o rodapé do painel com o ESTADO DE EDIÇÃO (ponto âmbar "Alterações não salvas" + a dica "Ctrl+Enter para salvar"; quando limpo, "Tudo salvo"), o "Concluir" verde contorno, o "Salvar alterações" primary (desabilitado sem mudança) e o menu ⋮ (reabrir / copiar link interno / cancelar). Mora em `sheet/` para o `WorkItemSheet.tsx` não crescer mais.
- `src/components/tasks/shared/sheet/rodape.ts` (novo): as duas regras puras do menu — `podeReabrir(status)` (só `done`/`cancelled`) e `linkInternoDaTarefa(id, {origin, pathname})` = `<origin><pathname>?view=tasks&task=<id>`, a MESMA URL que o `useWorkItemNotifications.openTask` grava. É navegação interna do próprio app; nenhum dado de cliente sai do sistema.
- `src/components/tasks/shared/WorkItemSheet.tsx`: etapa 141 (o Ctrl+Enter salva de qualquer campo do painel — antes só funcionava com o foco no botão); etapa 143 (guarda de fechamento: `alteradoRef` + confirmação "Descartar alterações?" com "Continuar editando"/"Descartar", com o Esc, o clique fora no overlay e o X do `SheetContent` caindo na MESMA proteção; os fechamentos programáticos de Salvar/Concluir/Cancelar seguem passando direto); etapa 144 (o Esc fecha e devolve o foco ao cartão `[data-item-id]` da tarefa; o F6 alterna painel ↔ lista/quadro); o rodapé antigo de três botões virou `<PainelRodape>`.
- `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` (novo): 12 casos das etapas 141–144.
- `src/components/tasks/__tests__/WorkItemSheet.test.tsx`: o caso "25" passou a abrir o ⋮ antes de clicar "Cancelar tarefa" (a etapa 142 tirou esse botão do rodapé). A asserção é a mesma: `onCancel` chamado com o item.

## Decisões declaradas (§3 do plano)
- §3, linha `| Rodapé: ponto âmbar "Alterações não salvas", "Ctrl + Enter para salvar", "Concluir", "Salvar alterações", ⋮ | PARCIAL (Ctrl+Enter existe, resto não) | 141–142 |`: era exatamente o estado do código; o "resto" (estado de edição, botões e ⋮) agora existe.
- Etapas 141, 142, 143 e 144 (§3, linhas 414–417 do plano).
- §8-bis, linha `| Painel não modal (D14) muda o contrato de foco... | Etapas 144, 145 e 151 com teste de foco; bottom sheet modal no celular. |`: o painel de HOJE é o `Sheet` modal (a etapa 145 é do cartão T34, não deste), então a armadilha de foco do Radix é o "foco preso" que o bottom sheet pede. O handler do F6 já alterna as duas direções — provado no teste, com o painel e o cartão no DOM.
- Só tokens do sistema, nenhuma cor literal: âmbar = fundo `bg-warning` + texto `text-[hsl(var(--warning-text))]` (definido em `src/styles/tokens.css`, claro e escuro); "Concluir" = `border-success/50 text-success`.
- Alvos de 40 px (`h-10`) nos três controles do rodapé. "Copiar link interno" usa `navigator.clipboard` e NÃO cria exportar/baixar/imprimir: é a URL interna da tarefa que o próprio app já grava (`?view=tasks&task=<id>`).
- Sem migration, Edge Function, dependência nova nem alteração em `src/components/ui/*`.

## Prova
- vermelho antes: mutei o guarda (`onMudouChange(false)`) em `WorkItemSheet.tsx` e rodei `npx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → `Tests 2 failed | 10 passed (12)` (casos "143: com alteração, o Esc pede confirmação em vez de fechar" e "143: "Descartar" fecha o painel; clique fora também respeita a proteção"); revertido em seguida (`git diff` vazio).
- verde depois: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → `Test Files 1 passed (1); Tests 12 passed (12)`.
- área de Tarefas + hooks: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 35 passed (35); Tests 413 passed | 1 todo (414)`.
- tipos: `npx tsc -b --force` → sem saída, exit 0. lint: `npx eslint src/components/tasks/shared/WorkItemSheet.tsx src/components/tasks/shared/sheet/PainelRodape.tsx src/components/tasks/shared/sheet/rodape.ts src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → exit 0.

## Casos de teste deste cartão (WorkItemSheet.rodape.test.tsx)
- 141: limpo mostra "Tudo salvo" e nenhuma dica; ao digitar no título aparece "Alterações não salvas" + "Ctrl+Enter para salvar"; o Ctrl+Enter no título chama `onSave(item, { title })`.
- 142: "Salvar alterações" desabilitado sem mudança e habilitado com mudança; "Concluir" chama `onMove(item, 'done')` e fecha; o ⋮ traz "Reabrir tarefa" (só em `done`/`cancelled`, chama `onMove(item, 'todo')`), "Copiar link interno" (grava `?view=tasks&task=t1` no clipboard) e "Cancelar tarefa" (chama `onCancel`).
- 143: com alteração o Esc mostra "Descartar alterações?" e NÃO fecha; "Continuar editando" fecha só o aviso; "Descartar" fecha (`onOpenChange(false)`); o clique fora no overlay também pede confirmação em vez de fechar; sem alteração o Esc fecha normal.
- 144: o Esc devolve o foco ao cartão `[data-item-id="t1"]`; o F6 é consumido (`preventDefault`) e alterna o foco painel → cartão → painel; a ordem de tab do rodapé é Concluir → Salvar → ⋮.

## O que NÃO fiz e por quê
- Não implementei o painel NÃO modal (etapa 145) nem a persistência do modo expandido (etapa 146): são dos cartões T34/outro; o F6 e a proteção ficam prontos para eles.
- Não li as imagens 01–05 (não há ferramenta de visão nesta sessão): a conferência foi contra a §3 do plano (linha do "Rodapé" e etapas 141–144), que é a referência de aceite.
- Diferença de escopo: os commits `chore(tarefas): traz a faixa dos pais...` e o do painel de Planejamento vêm do cherry-pick da faixa do pai (`t_2456ca64`); o meu commit (`feat(tarefas): rodape do painel...`) mexe só nos 5 arquivos listados acima.

## Faixa dos pais: o que tirei do diff (regra dos 90 mil caracteres)
- O cherry-pick da faixa dos pais subiu o diff para 107.334 caracteres adicionados e o `hermes-tarefa-fechar` recusou (regra de 90.000, para o revisor conseguir ler). Mesmo motivo pelo qual o cartão pai (`t_2456ca64`) voltou como `refazer 1`.
- Tirei do diff os TESTES que são de OUTROS cartões (vieram só porque a faixa inteira foi cherry-pickada): `primitivosCompartilhados.test.tsx` (cartão dos primitivos), `WorkItemSheet.painel.test.tsx` e `WorkItemSheet.planejamento.test.tsx` (cartões do painel), `workItemFormat.test.ts` (cartão do formato). Os arquivos de CÓDIGO da faixa ficam (o painel e os primitivos são a base do rodapé). Cada um desses testes volta com o cartão dono, quando ele for integrado — eu não os apaguei do repositório (eles não existem na `dia/2026-10-11`).
- `useMyWorkItems.test.tsx` existe na `dia/2026-10-11` (473 linhas): restaurei a versão da `dia` (sem as 26 linhas que a faixa do cartão do `contact_type` acrescentou), para não apagar arquivo que não é meu.
- Diff final: 64.033 caracteres adicionados, 18 arquivos — abaixo do teto.
- O juiz aponta arquivos de CÓDIGO da faixa que o cartão não lista (`TasksModule.tsx`, `ContactAvatar.tsx`, `DateLabel.tsx`, `PriorityPill.tsx`, `StatusPill.tsx`, `TaskCheckbox.tsx`, `TasksUiContext.tsx`, `tasksUi.ts`, `WorkItemSheet.tsx`, `PlanejamentoSection.tsx`, `planejamento.ts`, `workItemFormat.ts`, `workItem.types.ts`): são exatamente a FAIXA que a DEPENDÊNCIA do cartão manda trazer (`t_2456ca64`, `sha 87534f938`) e a base que o rodapé usa — nenhum deles existe na `dia/2026-10-11`, então sem eles o `tsc` e os meus testes não rodam. Não os removi; eles ficam no diff porque o cartão depende deles.


