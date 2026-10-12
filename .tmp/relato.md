Especialista: senior (componentes de tarefas; area-front-hooks consultada para os componentes compartilhados)

## Pontos da recusa

- Ponto 1: a entrega anterior veio com diff alheio/gerado e passava do limite. Refiz sobre `dia/2026-10-12` sem cherry-pick da cadeia antiga; o commit entregue é só `f3232f2e4 fix(tarefas): refaz barra de captura e vazio filtrado`. O diff medido agora tem estes arquivos e não inclui `.tmp/relato.md`, arquivos gerados, branch pai nem commits de outro cartão.
- Ponto 2: mantive o escopo no pedido original (barra/captura/vazios). `QuickAdd.tsx` recebeu captura de 48 px, placeholder `Capturar uma tarefa…`, dica `Enter para criar`, chips rápidos escondidos até o foco e retorno de foco após criar. `TasksModule.tsx` põe a captura e o toggle `Mostrar concluídas` na mesma linha, e move a troca de modo para antes da barra. `TasksFilterBar.tsx` só ganhou `showDoneToggle` para não duplicar o toggle que agora mora na captura. `TasksEmptyState.tsx` troca o vazio filtrado para `Nenhum resultado`, texto de ajuste e botão `Limpar filtros`.
- Ponto 3: acrescentei prova real para o comportamento em vez de só relato. `barraCapturaDisposicao.test.tsx` cobre placeholder/altura/dica, chips ao focar, retorno de foco, vazio filtrado e limpar filtros. `TasksModule.test.tsx` cobre que o toggle de concluídas fica na linha de captura e não fica duplicado na barra.

## Prova vermelho → verde

- Vermelho antes da correção visual/captura: `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` antes de alterar os componentes → exit 1; falhou porque `quick-add-hint`, `quick-add-chips` e o novo texto de vazio ainda não existiam.
- Verde depois: `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx` → `Test Files  1 passed (1)`; `Tests  5 passed (5)`.
- Vermelho do layout da linha de captura: reverti temporariamente `TasksModule.tsx` e `TasksFilterBar.tsx` para `HEAD^` e rodei `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx -t "toggle de concluídas"` → exit 1; `Unable to find an element by: [data-testid="tasks-capture-row"]`.
- Verde depois: `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx -t "toggle de concluídas"` → `Test Files  1 passed (1)`; `Tests  1 passed | 33 skipped (34)`.

## Verificação executada agora

- `bunx vitest run src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx src/components/tasks/__tests__/QuickAdd.test.tsx src/components/tasks/__tests__/QuickAddCompacto.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx` → `Test Files  5 passed (5)`; `Tests  60 passed (60)`.
- `bun run typecheck` → exit 0 (`tsc -b --force`).
- `bunx eslint src/components/tasks/TasksEmptyState.tsx src/components/tasks/TasksModule.tsx src/components/tasks/shared/QuickAdd.tsx src/components/tasks/shared/TasksFilterBar.tsx src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx` → exit 0.
- `bunx vitest run src/components/tasks/__tests__` → `Test Files  21 passed (21)`; `Tests  210 passed | 1 todo (211)`.
- `git diff --check` → exit 0.

## Arquivos no diff

```
src/components/tasks/TasksEmptyState.tsx
src/components/tasks/TasksModule.tsx
src/components/tasks/__tests__/TasksListMode.test.tsx
src/components/tasks/__tests__/TasksModule.test.tsx
src/components/tasks/__tests__/barraCapturaDisposicao.test.tsx
src/components/tasks/shared/QuickAdd.tsx
src/components/tasks/shared/TasksFilterBar.tsx
```

## O que não fiz

- Não trouxe o commit anterior `bc2882639` por cherry-pick porque ele carregava diff alheio da cadeia antiga. Reapliquei só o que atende ao pedido do cartão.
- Não mexi em banco, Edge Function, CI, dependência nova, produção nem arquivo gerado.