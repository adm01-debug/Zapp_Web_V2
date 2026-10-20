Especialista: semisenior (componentes/a11y)
## O que mudou e por quê
- src/components/groups/GroupsView.tsx: guarda `if (e.target !== e.currentTarget) return;` na 1ª linha do onKeyDown do card — tecla vinda de filho (ex. botão "Ações do grupo") não alterna mais a seleção.
- src/components/docs/SystemFeaturesView.tsx: mesma guarda no onKeyDown do card de seção da ajuda — mesma classe de defeito, mesmo padrão.
- src/components/groups/__tests__/GroupsView.a11y.test.tsx: teste novo "Enter no botão Ações do grupo não seleciona o grupo (t_12c888c1)".
## Prova
- vermelho antes (GroupsView.tsx revertido, teste novo mantido): `bun x vitest run src/components/groups/__tests__/GroupsView.a11y.test.tsx` → `FAIL ... aria-pressed="true"` (1 failed | 2 passed).
- verde depois (correção reaplicada): `bun x vitest run GroupsView.a11y SystemFeaturesView.a11y` → `Test Files 2 passed (2); Tests 5 passed (5)`; escopo cheio (GroupsView.a11y/test/broadcast, SystemFeaturesView.a11y/test, StatusChips.a11y, catalog a11y) → `Test Files 6 passed (6); Tests 30 passed (30)` + catalog `Tests 1 passed (1)`.
## Pontos do revisor (t_12c888c1)
- Ponto 1: resolvido — src/components/groups/GroupsView.tsx (guarda target/currentTarget no onKeyDown do card).
- Ponto 2: resolvido — src/components/groups/__tests__/GroupsView.a11y.test.tsx (teste do Enter no botão "Ações do grupo Meu Grupo": sem a correção seleciona, com a correção não).
- Ponto 3: resolvido — src/components/docs/SystemFeaturesView.tsx (mesma guarda no onKeyDown do card de seção).
## O que NÃO fiz e por quê
- Não alterei StatusChips nem ExternalProductManagement: a recusa só apontou a classe do defeito nos cards com filho focável (grupos e ajuda); os outros dois controles não têm onKeyDown com filho interativo dentro.
## Arquivos (git diff --name-only 453e6b69f9...HEAD)
- src/components/catalog/ExternalProductManagement.tsx
- src/components/catalog/__tests__/ExternalProductManagement.a11y.test.tsx
- src/components/docs/SystemFeaturesView.tsx
- src/components/docs/__tests__/SystemFeaturesView.a11y.test.tsx
- src/components/groups/GroupsView.tsx
- src/components/groups/__tests__/GroupsView.a11y.test.tsx
- src/components/inbox/__tests__/StatusChips.a11y.test.tsx
- src/components/inbox/conversation-list/StatusChips.tsx
## Verificação
- `bun x vitest run` (7 arquivos do escopo): 31 testes, zero falha (saídas acima).
- `zapp-verify <cópia> --rapido`: `VERIFY: VERDE SEM BANCO (12s)` — OK db_guard, tipos, lint, migrations; banco_local não verificado (sem migration no cartão).
