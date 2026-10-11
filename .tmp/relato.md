Especialista: iris (area-front-componentes)

## Como resolvi o ponto da recusa (diff grande demais)
- Ponto 1 (dividir a entrega ou tirar arquivos irrelevantes do commit): tirei do diff os arquivos de OUTROS cartões que a faixa dos pais trouxe — `src/components/tasks/shared/sheet/PlanejamentoSection.tsx` e `src/components/tasks/shared/sheet/planejamento.ts` (seção "Planejamento" e a linha "Criada em", que são do cartão `t_6b27a2a2`, este sim com branch própria na fila) e os testes dos pais (`primitivosCompartilhados.test.tsx`, `WorkItemSheet.painel.test.tsx`, `workItemFormat.test.ts`); `useMyWorkItems.test.tsx` voltou à versão da `dia/2026-10-11`. Com isso a seção Planejamento saiu do `WorkItemSheet.tsx` (import + JSX e o `formatCriadaEm`/`lembreteElegivel`, que só ela usava), e o diff deste cartão ficou com a faixa dos pais + o meu rodapé, abaixo do teto (o número exato está no bloco FATOS MEDIDOS do fechar). Nada se perde: o que é do outro cartão volta com ele, que já está na fila.
- Mantive no diff só o que este cartão precisa: a faixa dos pais (primitivos de `shared/` e a base do painel, `t_2456ca64`, cujo sha está no `.v2-fila`) e os formatos de `src/hooks/tasks/workItemFormat.ts` (T04), que o próprio cartão manda usar.

## O que mudou e por quê
- `src/components/tasks/shared/sheet/PainelRodape.tsx` (novo): etapas 141–142 — ponto âmbar "Alterações não salvas" + dica "Ctrl+Enter para salvar" (limpo: "Tudo salvo"), "Concluir" verde contorno, "Salvar alterações" primary (desabilitado sem mudança) e menu ⋮ (reabrir / copiar link interno / cancelar). Mora em `sheet/` para o `WorkItemSheet.tsx` não crescer.
- `src/components/tasks/shared/sheet/rodape.ts` (novo): as duas regras puras do menu — `podeReabrir(status)` (só `done`/`cancelled`) e `linkInternoDaTarefa(id, {origin, pathname})` = `<origin><pathname>?view=tasks&task=<id>` (a mesma URL interna que o `useWorkItemNotifications.openTask` usa; navegação do próprio app, nenhum dado de cliente sai).
- `src/components/tasks/shared/WorkItemSheet.tsx`: etapa 141 (Ctrl+Enter salva de qualquer campo do painel), 143 (`alteradoRef` + confirmação "Descartar alterações?", com Esc, clique fora no overlay e X caindo na mesma proteção; os fechamentos programáticos de Salvar/Concluir/Cancelar seguem passando direto) e 144 (Esc fecha e devolve o foco ao cartão `[data-item-id]`; F6 alterna painel ↔ lista/quadro). O rodapé antigo de três botões virou `<PainelRodape>`.
- `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` (novo): 12 casos das etapas 141–144.
- `src/components/tasks/__tests__/WorkItemSheet.test.tsx`: o caso "25" abre o ⋮ antes de clicar "Cancelar tarefa" (a etapa 142 tirou esse botão do rodapé); a asserção é a mesma (`onCancel` com o item).

## Onde cada elemento está no plano (§3, referência de aceite)
- §3, linha `| Rodapé: ponto âmbar "Alterações não salvas", "Ctrl + Enter para salvar", "Concluir", "Salvar alterações", ⋮ | PARCIAL (Ctrl+Enter existe, resto não) | 141–142 |`: era o estado do código; o "resto" agora existe.
- Etapas 141, 142, 143 e 144 (§3, linhas 414–417).
- §8-bis, linha do painel não modal (D14): o painel de hoje é o `Sheet` modal (a etapa 145 é do T34), então F6/Esc cobrem as duas direções com o painel e o cartão no DOM.
- Tokens só do sistema: âmbar = `bg-warning` + `text-[hsl(var(--warning-text))]` (definidos em `src/styles/tokens.css`); "Concluir" = `border-success/50 text-success`. Alvos `h-10` (40 px) nos três controles. Sem migration, Edge Function, dependência nova ou mudança em `src/components/ui/*`.

## Prova
- vermelho antes: mutei duas linhas do meu código (o Ctrl+Enter virou F9 e o guarda do Esc virou `if (false)`), rodei `npx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` → `Tests 2 failed | 10 passed (12)`, falhando exatamente "141: Ctrl+Enter em qualquer campo salva a alteração" e "143: com alteração, o Esc pede confirmação em vez de fechar". Desfiz a mutação.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 12 passed (12)`; `npx vitest run src/components/tasks/__tests__/WorkItemSheet.test.tsx` → `Test Files 1 passed (1); Tests 25 passed (25)`.
- `npx tsc --noEmit` sem saída (sem erro) e o rodapé sem arquivo de outro cartão.
- Verificação do fechar: `zapp-verify . --rapido` (o resultado está no bloco FATOS MEDIDOS abaixo).

## Casos de teste deste cartão (WorkItemSheet.rodape.test.tsx)
- 141: limpo mostra "Tudo salvo"; ao digitar aparece "Alterações não salvas" + dica; Ctrl+Enter no título chama `onSave(item, { title })`.
- 142: "Salvar alterações" desabilitado sem mudança e habilitado com mudança; "Concluir" chama `onMove(item, 'done')` e fecha; ⋮ traz "Reabrir tarefa" (só em `done`/`cancelled`, chama `onMove(item, 'todo')`), "Copiar link interno" (grava `?view=tasks&task=t1`) e "Cancelar tarefa" (`onCancel`).
- 143: com alteração o Esc mostra "Descartar alterações?" e não fecha; "Continuar editando" fecha só o aviso; "Descartar" fecha; o clique fora também pede confirmação; sem alteração o Esc fecha direto.
- 144: o Esc devolve o foco ao cartão `[data-item-id="t1"]`; o F6 é consumido e alterna painel → cartão → painel; ordem de tab do rodapé Concluir → Salvar → ⋮.

## O que NÃO fiz e por quê
- Não implementei a seção Planejamento nem "Criada em" (cartão `t_6b27a2a2`) — sai do meu diff e volta com o cartão dono.
- Não implementei o painel NÃO modal (etapa 145) nem a persistência do modo expandido (146): são de outros cartões; F6 e a proteção ficam prontos para eles.
- Não li as imagens 01–05 (esta sessão não tem ferramenta de visão): conferi contra a §3 do plano, que o cartão declara como referência de aceite.
