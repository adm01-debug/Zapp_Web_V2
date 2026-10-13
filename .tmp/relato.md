Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useLatestAnalysis.ts: o queryFn lançava o erro em vez de devolver `null` no `if (error)`, e loga. Antes um erro de rede/RLS aparecia como "contato sem análise"; agora `useQuery` expõe `isError`.
- src/hooks/business/useBusinessHoursCheck.ts: mesmo defeito no RPC `is_within_business_hours` — lança + loga; `isError` deixa de ser sempre falso.
- src/hooks/chat/useMediaSenderProfiles.ts: extraí `loadSenderProfiles` (devolve `{profiles, error}`); o hook `useMediaSenderProfiles` agora LANÇA no erro e expõe `isError` no estado. `fetchSenderProfiles` (contrato consumido pelo Journey/`useJourneyActors`) continua devolvendo mapa vazio sem exceção — só ganhou o log. Comentários do topo e do `fetchSenderProfiles` atualizados para a nova semântica.
- src/hooks/system/usePermissions.ts: as três leituras (`permissions`, `role_permissions`, `user_roles`→`role_permissions`) passam a LANÇAR no erro em vez de engolir; `fetchUserPermissionsWithRetry` tenta 3x; o hook expõe `error` (string|null) e nega por padrão (userPermissions vazio) quando não carregou. `refetch` também sinaliza e relança.
- src/hooks/dashboard/useDashboardUrlFilters.ts: `?queue=`/`?agent=` só são aceitos se forem UUID (regex); valor não-uuid vira `null` e nunca chega às colunas uuid (evitava 22P02). Leitura, não escrita.

## Testes
- Novos: src/hooks/chat/__tests__/useLatestAnalysis.test.tsx, src/hooks/business/__tests__/useBusinessHoursCheck.test.tsx, src/hooks/system/__tests__/usePermissions.test.tsx (erro sinaliza, retry 3x, nega por padrão, sem usuário não consulta).
- Alterados: useMediaSenderProfiles.test.tsx (teste novo de `isError`; o de mapa vazio segue passando) e useDashboardUrlFilters.test.tsx (leitura usa UUIDs válidos; novos casos de id inválido ignorado). Nenhum teste existente foi afrouxado — o caso de leitura ficou mais estrito.

## Prova
- vermelho antes (código da base): `npx vitest run <5 arquivos>` → `Test Files 5 failed (5); Tests 9 failed | 24 passed (33)`
- verde depois: `npx vitest run <5 arquivos>` → `Test Files 5 passed (5); Tests 33 passed (33)`
- sem regressão no consumidor do contrato mantido: `npx vitest run src/hooks/chat/journey/__tests__/useJourneyActors.test.tsx` → `Tests 15 passed (15)`

## O que NÃO fiz e por quê
- Não toquei em src/components/** nem em useDashboardStats.ts: estão fora da minha área. O `error` de `usePermissions` fica exposto para a tela exibir "permissões não carregaram"; a `PermissionMatrix` já nega por padrão (userPermissions vazio) e não destrincha `error`/`refetch`.
- Não validei UUID na escrita do `setFilters` (só na leitura): o bug é URL compartilhada/editada; a escrita recebe ids da própria UI.
