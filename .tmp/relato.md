Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- Recorte da entrega (o ponto da recusa): a branch passou a trazer da faixa dos pais só o CÓDIGO que o Quadro
  precisa (primitivos compartilhados, subtítulo/limite, cartão redesenhado) e NÃO carrega mais os testes que
  pertencem a esses cartões vizinhos — cada um deles entrega o próprio teste na sua branch. Também saíram os
  commits que só mexiam em `.tmp/relato.md`. O diff para o revisor caiu de 126 682 para 88 883 caracteres.
- `src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx`: teste novo das etapas 094–098
  (arrastar polido, alvo de soltura, Aguardando, teclado e rolagem), 332 linhas, 11 casos, sem comentário de
  enchimento.
- `src/components/tasks/board/boardInteracao.ts`: helpers puros `colunaVizinha` (ponta × meio) e
  `bordasDeRolagem` (onde ainda há conteúdo escondido), consumidos pelo teclado e pelas sombras.
- `src/components/tasks/board/BoardColumn.tsx`: overlay elevado no cartão levantado, rasgo tracejado no lugar
  da soltura, realce âmbar em Aguardando e dica de destino com a contagem que fica.
- `src/components/tasks/board/TasksBoardMode.tsx`: trilho com `snap-x snap-mandatory motion-safe:scroll-smooth`,
  sombras de borda (esq/dir) e `onKeyDown` do teclado do Quadro.
- `src/components/tasks/shared/pointerMedia.ts`: `usePressaoLonga` — no toque o arrasto só pega depois da
  pressão longa; toque curto desarma.

## Prova
- vermelho antes: mutando `TasksBoardMode.tsx` (tirando `onKeyDown={handleTeclado}`):
  `Test Files 1 failed (1)` / `Tests 3 failed | 8 passed (11)` — as três do teclado (←/→ entre colunas,
  Alt+→ move com índice do destino, Alt+→ em Aguardando abre o painel do motivo) caem.
- verde depois: `npx vitest run src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx`
  → `Test Files 1 passed (1)` / `Tests 11 passed (11)`.
- suíte do módulo: `npx vitest run src/components/tasks` → `Test Files 23 passed (23)` /
  `Tests 241 passed | 1 todo (242)`.
- `npx tsc -b --force` → exit 0 (sem saída).
- `npx eslint src/components/tasks/board src/components/tasks/shared/pointerMedia.ts
  src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx` → exit 0.
- diff que o revisor mede (`git diff --text --stat --patch --unified=3 dia/2026-10-11...HEAD -- .`):
  88 883 caracteres (cap 90 000).

## Pontos do revisor ([refazer 1])
- Ponto 1 — "diff de 126 682 caracteres é grande demais": atendido. A branch deixou de carregar os testes dos
  cartões pais (`BoardColumn.subtitulo-limite.test.tsx`) e os commits de relato; o meu teste foi enxugado de
  384 para 332 linhas. Ficou em 88 883, abaixo do cap.
- Ponto 2 — "ou remova do commit arquivos gerados/irrelevantes": atendido. Os quatro commits que só mexiam em
  `.tmp/relato.md` ficaram fora da branch; nenhum arquivo gerado entra no diff.

## Aviso do juiz barato (não procede)
- "mexeu em arquivo que o cartão não lista": `TasksModule.tsx`, `shared/ContactAvatar/DateLabel/PriorityPill/
  StatusPill/TaskCheckbox/TasksUiContext/tasksUi`, `WorkItemCard*`, `workItemFormat/types` são a FAIXA DOS PAIS
  que a própria DEPENDÊNCIA do cartão manda trazer (primitivos, subtítulo, cartão redesenhado); não são edição
  minha deste cartão, e sem eles o Quadro não compila. Por isso rodei o mesmo fechar de novo, sem mudar código.

## O que NÃO fiz e por quê
- Não conferi em navegador real (nem tema escuro/alto contraste com print): a prova é o teste de componente
  em jsdom, com as classes REAIS renderizadas e mutação vermelho→verde. Não há captura no diff.
- Não mexi em arquivo de outro assunto; o que é meu nesta entrega é o módulo do título (Quadro/Tarefas).
