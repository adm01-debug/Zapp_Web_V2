# Code Truth — Structural Sweep — 2026-10-03

Baseline main: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`.

## Árvore
- 4.065 blobs/arquivos.
- 1.952 arquivos em `src/`.
- 865 arquivos classificados por caminho/nome como test/e2e/spec.
- Extensões dominantes: 1.141 TSX, 1.092 TS, 871 SQL, 352 Markdown, 157 MJS, 95 shell.

## Busca de nomes suspeitos
23 paths bateram em padrões backup/legacy/deprecated/archive/superseded. A maioria NÃO é lixo:
- `MFABackupCodes` é funcionalidade de MFA, falso positivo lexical.
- migrations com "legacy" podem ser transições históricas obrigatórias.
- `_superseded/` é HISTORICAL_REQUIRED.
- testes de legacy podem ser guardas contra regressão.

Conclusão: filename heuristic não autoriza exclusão.

## Deprecated explícito no src
Code search por `@deprecated` retornou 10 arquivos:
- hooks/tasks/useMyTasks.ts
- ErrorBoundary.tsx
- hooks/communication/useCalls.ts
- GenericEmptyState.tsx
- dashboard/MiniSparkline.tsx
- lib/mapboxCostGuard.ts
- hooks/communication/useCallHistory.ts
- calls/CallDialog.tsx
- hooks/tasks/useMyWorkItems.ts
- calls/__tests__/calls-access.test.ts

Cada um precisa de consumidor/graph proof. Em Telefonia há legado deliberadamente mantido até migração de consumidores.

## Type escape
Busca por `ts-expect-error`: 1 arquivo, `src/hooks/team-chat/useDepartmentManagement.ts`. Team Chat já possui histórico de contrato quebrado; investigar como item de Code Truth.
Busca por FIXME no src: 0 resultados no snapshot.
Busca textual por TODO retornou 225 arquivos/resultados. Isso NÃO significa 225 bugs: TODO pode ser comentário, status/domain literal ou teste. Precisa normalização AST/textual antes de virar backlog.

## Regra para DEAD_CONFIRMED
Exigir, quando aplicável:
1. zero import estático;
2. zero dynamic import;
3. zero export/registry/router/command mapping;
4. zero referência de configuração/feature flag;
5. zero listener/emitter relevante;
6. zero referência Edge/SQL/RPC por string;
7. Graphify sem consumidores relevantes;
8. targeted tests + typecheck/build verdes após remoção.

Só então DELETE-A, em missão separada.

## Prioridade de Code Truth
1. Team Chat (ts-expect-error + histórico de regressões).
2. Telefonia deprecated/legacy.
3. Tarefas resíduos já documentados.
4. TODOs em áreas críticas (auth/security/db/calls/team-chat) antes de TODOs cosméticos.
5. legacy-functions.json e contratos de producers somente depois de entender deploy/guards.
