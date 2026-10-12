Especialista: senior (componentes de tarefas; area-front-hooks consultada para componentes compartilhados)

## O que mudou e por quê
- `src/components/tasks/shared/QuickAdd.tsx`: a captura agora tem 48 px, placeholder `Capturar uma tarefa…`, dica `Enter para criar`, chips rápidos ocultos até o foco e retorno de foco para o input após criar. Isso resolve as etapas 040 e 042 sem trazer o diff antigo.
- `src/components/tasks/TasksModule.tsx`: a linha de captura agora agrupa `QuickAdd` e o toggle `Mostrar concluídas`; a troca de modo fica antes da barra de filtros, como o pedido de disposição da barra/captura pedia.
- `src/components/tasks/shared/TasksFilterBar.tsx`: mudança mínima e indispensável (`showDoneToggle`) para não duplicar o toggle quando ele é movido para a linha de captura. Este arquivo não estava na lista curta, mas sem este ajuste o mesmo controle fica duas vezes na tela; por isso não é achado fora de escopo, é suporte direto ao item “concluídas junto da captura”.
- `src/components/tasks/TasksEmptyState.tsx`: o vazio filtrado virou `Nenhum resultado`, com orientação para ajustar busca/filtros e botão `Limpar filtros` em um clique.
- Testes: `barraCapturaDisposicao.test.tsx`, `TasksModule.test.tsx` e `TasksListMode.test.tsx` cobrem os caminhos alterados.

## Pontos da recusa
- Ponto 1: a entrega recusada carregava diff alheio/gerado e ultrapassava o limite. Refiz sobre `dia/2026-10-12`; o código entregue fica restrito aos componentes/testes da barra de captura e vazio filtrado, sem cherry-pick da cadeia antiga.
- Ponto 2: a divisão pedida foi aplicada no escopo deste cartão: não trouxe branch pai, não trouxe arquivos gerados e não mexi em banco, Edge, CI, dependência ou produção.
- Ponto 3: a prova agora é teste real vermelho→verde e verificação verde, listados abaixo.

## Prova vermelho → verde
- Vermelho antes da correção visual/captura: `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` antes de alterar os componentes → exit 1; falhou porque `quick-add-hint`, `quick-add-chips` e o novo texto de vazio ainda não existiam.
- Verde depois: `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` → `Test Files  1 passed (1)`; `Tests  5 passed (5)`.
- Vermelho do layout da linha de captura: reverti temporariamente `TasksModule.tsx` e `TasksFilterBar.tsx` para `HEAD^` e rodei `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx -t "toggle de concluídas"` → exit 1; `Unable to find an element by: [data-testid="tasks-capture-row"]`.
- Verde depois: `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx -t "toggle de concluídas"` → `Test Files  1 passed (1)`; `Tests  1 passed | 33 skipped (34)`.

## Verificação verde executada agora
- `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx src/components/tasks/__tests__/QuickAdd.test.tsx src/components/tasks/__tests__/QuickAddCompacto.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx` → `Test Files  5 passed (5)`; `Tests  60 passed (60)`.
- `bun run typecheck` → exit 0 (`tsc -b --force`).
- `bunx eslint src/components/tasks/TasksEmptyState.tsx src/components/tasks/TasksModule.tsx src/components/tasks/shared/QuickAdd.tsx src/components/tasks/shared/TasksFilterBar.tsx src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx` → exit 0.
- `bunx vitest run src/components/tasks/__tests__` → `Test Files  21 passed (21)`; `Tests  210 passed | 1 todo (211)`.
- `git diff --check` → exit 0.

## Arquivos no diff
```
.tmp/relato.md
src/components/tasks/TasksEmptyState.tsx
src/components/tasks/TasksModule.tsx
src/components/tasks/__tests__/TasksListMode.test.tsx
src/components/tasks/__tests__/TasksModule.test.tsx
src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx
src/components/tasks/shared/QuickAdd.tsx
src/components/tasks/shared/TasksFilterBar.tsx
```

## O que não fiz
- Não trouxe o commit anterior `bc2882639` por cherry-pick, porque ele carregava diff alheio da cadeia antiga.
- Não mexi em banco, Edge Function, CI, dependência nova, produção nem arquivo gerado fora do relato exigido pelo fechamento.
