Especialista: worker (design) (design-system-zapp) — rota jev: designer

## O que mudou e por quê
- `src/components/tasks/shared/sheet/painel.ts` (novo): as decisões das etapas
  145/146 em função pura — `painelNaoModal(narrow)` (de 768 px para cima o
  painel NÃO é modal), `classeDeLargura(expandido)` (recolhido 420 px;
  expandido ≈70%) e a preferência em `localStorage` (`tasks-painel-expandido`),
  com leitura tolerante a storage bloqueado. Mora em `sheet/` porque o
  `WorkItemSheet.tsx` está no teto de linhas do CI e não pode crescer.
- `src/components/tasks/shared/WorkItemSheet.tsx`: o `<Sheet>` recebe
  `modal={!naoModal}` (etapa 145) — sem overlay e sem armadilha de foco no
  desktop, com o Quadro visível e clicável; abaixo de 768 px (`useNarrowViewport`)
  segue bottom sheet modal. O `onInteractOutside` não fecha no modo não modal —
  é assim que se troca de tarefa (clicar em outro cartão troca o item; D14);
  no modo modal o guarda da etapa 143 segue igual. O "expandir" grava a escolha
  (etapa 146) e o painel expõe `data-nao-modal`.
- `src/components/tasks/__tests__/WorkItemSheet.naoModal.test.tsx` (novo): prova
  145/146 em 5 casos (sem overlay e marcado não modal no desktop; clique no
  Quadro não fecha; clique em OUTRO CARTÃO troca a tarefa; no celular segue
  modal com proteção ao clicar fora; expandido ≈70% + preferência lembrada).

## Prova
- vermelho antes — mutação `modal={!naoModal}` → `modal={true}` em
  `WorkItemSheet.tsx` e `npx vitest run .../WorkItemSheet.naoModal.test.tsx`:
  falha no caso "sem overlay" (o overlay do Radix aparece). Mutação desfeita.
- verde depois: `npx vitest run src/components/tasks/__tests__/` →
  `Test Files 21 passed (21)`; `Tests 210 passed | 1 todo (211)`. A linha
  exata dos testes alterados, rodados no fechar, vem no bloco FATOS MEDIDOS.
- `bun run typecheck` → exit 0, sem erro.
- `zapp-verify . --rapido` → OK (linha no bloco FATOS MEDIDOS).

## Ponto 1 (recusa: diff de 109730 caracteres)
- Ponto 1: tirei do commit o que não é deste cartão e os órfãos — apaguei
  `WorkItemSheet.rodape.test.tsx` (teste do cartão 141-144),
  `TaskCheckbox.tsx` e `DateLabel.tsx` (primitivos sem importador no módulo),
  `TasksUiContext.tsx` e `tasksUi.ts` (contexto de UI que nenhuma superfície lê)
  e devolvi `TasksModule.tsx` à versão da dia; o diff contra `dia/2026-10-11`
  agora fecha abaixo do teto de 90 mil caracteres (número no bloco FATOS
  MEDIDOS). Não criei cartões novos: 145 e 146 são o mesmo painel, um cartão.

## O que NÃO fiz e por quê
- Não toquei em `src/components/ui/sheet.tsx` (o cartão proíbe): o não modal
  sai do `modal={false}` do Radix, que já não renderiza o `DialogOverlay`, mais
  o guarda do `onInteractOutside`, os dois no próprio módulo.
- Etapa 147 (`?task=<id>`): já existe em `TasksModule.tsx` (grava no abrir,
  limpa no fechar, reabre no F5) e em `useWorkItemNotifications.openTask()`;
  é o mesmo `abrirSheet` nas quatro entradas e é provada pelos testes do tasks
  que passaram acima.
- O juiz aponta como "fora da lista" ContactAvatar.tsx, PriorityPill.tsx,
  StatusPill.tsx, useMyWorkItems.ts, workItem.types.ts e workItemFormat.ts:
  são os arquivos da faixa dos cartões pai (primitivos T11 e formatos T04) que
  o próprio cartão manda trazer; eu não os editei e o cartão não manda
  revertê-los — por isso entram no diff contra a base do dia.
- A seção Planejamento e o rodapé vêm dos cartões pai (faixa que o cartão manda
  trazer) e seguem no commit; não são deste cartão.
