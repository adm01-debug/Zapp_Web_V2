Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/sheet/painel.ts` (novo): as duas decisões da
  etapa 145/146 em função pura — `painelNaoModal(narrow)` (de `md`, 768px, para
  cima o painel NÃO é modal), `classeDeLargura(expandido)` (recolhido 420px;
  expandido ≈70% da janela) e a preferência de exibição no `localStorage`
  (`tasks-painel-expandido`, D11), com leitura tolerante a storage bloqueado.
  Ficou em `sheet/` porque o `WorkItemSheet.tsx` está no teto de linhas do CI e
  não pode crescer.
- `src/components/tasks/shared/WorkItemSheet.tsx`: o `<Sheet>` recebe
  `modal={!naoModal}` (etapa 145) — sem overlay e sem armadilha de foco no
  desktop, com o Quadro visível e clicável; no celular (`max-width: 767px`,
  `useNarrowViewport`) continua o bottom sheet modal. O `onInteractOutside`
  agora não fecha no modo não modal (é assim que se troca de tarefa: clicar em
  outro cartão troca o item do painel — D14); no modo modal a proteção da etapa
  143 segue igual. O "expandir" do cabeçalho passa a gravar a escolha (etapa
  146) e o painel ganhou `data-nao-modal` para o modo ser verificável.
- `src/components/tasks/__tests__/WorkItemSheet.naoModal.test.tsx` (novo): prova
  as etapas 145 e 146 (sem overlay/marcado não modal; clique no Quadro não
  fecha; clique em OUTRO CARTÃO troca a tarefa com o painel aberto; no celular
  segue modal com proteção ao clicar fora; expandido ≈70% + preferência
  lembrada entre montagens).
- `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx`: o caso
  "clique fora respeita a proteção" (etapa 143) passou a rodar na tela estreita,
  que é o único modo com "clicar fora" depois da 145 — a asserção é a mesma
  (pede confirmação em vez de fechar). O desktop ficou coberto pelo arquivo
  novo, que também checa o caso sem edição pendente.

## Prova
- vermelho antes: `git checkout HEAD~1 -- src/components/tasks/shared/WorkItemSheet.tsx && npx vitest run src/components/tasks/__tests__/WorkItemSheet.naoModal.test.tsx`
  → `Test Files 1 failed (1)`; `Tests 5 failed (5)`
- verde depois: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.naoModal.test.tsx`
  → `Test Files 1 passed (1)`; `Tests 5 passed (5)`
- regressão da área: `npx vitest run src/components/tasks/__tests__`
  → `Test Files 22 passed (22)`; `Tests 222 passed | 1 todo (223)`

## Etapa 147 (URL `?task=`)
Já está implementada fora dos arquivos deste cartão e não foi reescrita:
`TasksModule.tsx` grava/limpa `?task=<id>` no abrir/fechar (`abrirSheet`/
`fecharSheet`) e reabre no F5; `useWorkItemNotifications.openTask()` navega para
`?view=tasks&task=<id>` (o caminho do aviso). Provado pelos testes que já
existem e passam na execução acima: `TasksModule.entrada.test.tsx`,
`TasksModule.test.tsx` e `useTasksFilters.test.tsx` (fluxo do `openTask`).
A transição é a mesma nas quatro entradas porque todas passam pelo mesmo
`abrirSheet` → mesmo `WorkItemSheet`; o painel não modal não mudou esse caminho.

## O que NÃO fiz e por quê
- A faixa dos pais (8 commits da rota t_de2b6fcf @ 787bdc814) está no diff
  contra a base do dia porque o cartão manda trazê-la; ela não é minha e é o
  que faz o diff contra `dia/2026-10-11` ficar grande. O MEU diff é
  `git diff --name-only 4911a7ffd..HEAD` = os 4 arquivos do cartão + este
  relato. Por isso o aviso do juiz sobre "arquivo fora da lista" (TasksModule,
  ContactAvatar, DateLabel, PriorityPill, StatusPill, TaskCheckbox…) aponta
  arquivos que vieram nos commits da ROTA, não neste cartão: são
  `00a8f5c6d`/`a78a4688c`/`ae391bf22`… da faixa, intactos.
- Não mexi em `src/components/ui/sheet.tsx` (o cartão proíbe): o modo não modal
  sai do `modal={false}` do Radix, que já não renderiza o `DialogOverlay`, mais
  o guarda do `onInteractOutside` — os dois no próprio módulo.
- Largura recolhida continua 420px: alterar para 480–560px é a etapa 131 (do
  designer), fora do título deste cartão.
- A troca de tarefa com edição pendente (rascunho/aviso "Esta tarefa mudou") é a
  etapa 148; aqui a troca pelo Quadro segue a semântica que já existia (a
  confirmação some quando o item do painel muda).
