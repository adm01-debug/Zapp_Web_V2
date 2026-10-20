- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 86s;OK lint 0s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (12/10 18:08, gerados por máquina: valem mais que números escritos à mão)
```
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff vazio

Especialista: senior (refazer front/componente; skill de área solicitada no cartão não está instalada neste perfil)

## Pontos da recusa

- Ponto 1: conflito do cherry-pick anterior (`cf28870d9`) em `src/components/theme/HighContrastToggle.tsx`.
  O que fiz: tentei o cherry-pick do commit recusado sobre a base atual (`dia/2026-10-12`). O conflito mostrou que a base atual já contém a correção equivalente: o `AccessibilitySettings` monta seu próprio `TooltipProvider`, mantém `Tooltip`/`TooltipContent` no botão de acessibilidade, conserva o `aria-label="Configurações de acessibilidade"` e usa a dica `Acessibilidade — alto contraste, menos movimento, texto grande` à direita. Resolvi preservando a versão da base atual e removendo o arquivo duplicado que o cherry-pick tentava reintroduzir (`AccessibilityTooltip.test.tsx`), porque o teste consolidado já está em `src/components/theme/__tests__/HighContrastToggle.test.tsx`.
  Prova: `git cherry-pick cf28870d9` entrou em conflito só em `HighContrastToggle.tsx`; depois da resolução, `git cherry-pick --continue` informou `nothing to commit, working tree clean` e `The previous cherry-pick is now empty`, então usei `git cherry-pick --skip` para não duplicar diff.

- Ponto 2: preservar a solução já integrada na linha atual em vez de trocar por implementação antiga.
  O que fiz: não alterei código de produção nem teste; mantive a solução atual da base diária, que cobre a recusa original com provider local e teste real do componente. Como `hermes-tarefa-fechar` exige commit novo, criei commit vazio `20bb37e10` somente para registrar este refazer sem introduzir diff.
  Prova verde: `bun run test -- src/components/theme/__tests__/HighContrastToggle.test.tsx src/components/transitions/__tests__/routeTransitionReducedMotion.test.tsx` -> `Test Files  2 passed (2)` e `Tests  11 passed (11)`.

## Arquivos do diff contra a base

Saída de `git diff --name-only dia/2026-10-12...HEAD`: vazia.
Saída de `git diff dia/2026-10-12...HEAD | wc -c`: `0`.

## Verificações executadas

- `bun install` -> dependências instaladas no workspace.
- `bun run test -- src/components/theme/__tests__/HighContrastToggle.test.tsx src/components/transitions/__tests__/routeTransitionReducedMotion.test.tsx` -> `Test Files  2 passed (2)`; `Tests  11 passed (11)`.
- `git status --short --branch` -> só a branch do cartão, sem arquivos modificados.
- `git log --oneline dia/2026-10-12..HEAD` -> `20bb37e10 fix(a11y): preserva dica do botão de acessibilidade`.
- `git diff --name-only dia/2026-10-12...HEAD` -> vazio.
- `git diff dia/2026-10-12...HEAD | wc -c` -> `0`.
- `git grep -n '<<<<<<<\|>>>>>>>\|=======' -- src/components/theme/HighContrastToggle.tsx src/components/theme/__tests__/HighContrastToggle.test.tsx` -> sem saída.

## O que NÃO fiz e por quê

- Não reintroduzi diff de código: o cherry-pick ficou vazio porque a base atual já contém a correção e o teste equivalentes.
- Não reintroduzi `src/components/theme/__tests__/AccessibilityTooltip.test.tsx`: o teste aceito na base atual está consolidado em `HighContrastToggle.test.tsx`, cobrindo o provider local, a dica por mouse, a dica por foco, o lado direito e o `aria-label` preservado.
