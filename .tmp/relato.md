Especialista: hugo
## O que mudou e por quê
- `src/lib/safeStorage.ts` (`createSafeStorage().setItem`, ramo persistente): quando `safeSetItem` falha, agora remove a chave persistida (`safeRemoveItem(key)`) antes de guardar o novo valor em memória. Motivo: ponto 1 da recusa — com valor prévio persistido, o `getItem` devolvia o token antigo já rotacionado e o próximo refresh derrubava a sessão.
- `src/lib/__tests__/safeStorage.adapter.test.ts`: caso novo com valor prévio no localStorage seguido de escrita que falha, esperando o valor novo.
## Prova
- vermelho antes: `npx vitest run src/lib/__tests__/safeStorage.adapter.test.ts` → `AssertionError: expected 'token-antigo' to be 'token-novo'`, `Tests  1 failed | 3 passed (4)`
- verde depois: mesmo comando → `Tests  4 passed (4)`
- sem regressão nos vizinhos: `npx vitest run src/lib/__tests__/mediaVolumeStore.test.ts src/hooks/communication/__tests__/useMediaVolume.test.tsx` → `Test Files  2 passed (2)`, `Tests  31 passed (31)`
- sem regressão nas suítes do cartão (ProtectedRoute boot-erro, ProtectedRoute logout-aguardado, useAuth bootstrap-erro, useUserRole ×2) → `Test Files  5 passed (5)`, `Tests  19 passed (19)`
## Pontos do revisor
- Ponto 1: resolvido — `src/lib/safeStorage.ts` (setItem do ramo persistente) + teste `devolve o valor novo da memória quando a escrita falha e já havia valor persistido` em `src/lib/__tests__/safeStorage.adapter.test.ts` (vermelho antes e verde depois acima). Usei a primeira alternativa da recusa (remover a persistida na falha); o `getItem` segue preferindo o persistido, que nesse cenário passa a ser null e cai na memória com o valor novo.
## O que NÃO fiz e por quê
- Não alterei o `getItem` nem o formato gravado: o leitor direto da sessão em `src/lib/mediaVolumeStore.ts` (`readAuthenticatedUserId`) lê o texto cru do `sb-*-auth-token` no localStorage; mudar o formato seria defeito novo fora do ponto.
- Workspace: a guarda vinculou esta sessão ao workspace da entrega anterior (já continha `1f992597f1` + `95ee577df7` sobre a base `96dd72dc5f`); commitei o refazer em cima (`1242965bee`) em vez de workspace novo + cherry-pick — conteúdo idêntico ao pedido, sem diff alheio.
## Arquivos (`git diff --name-only 95ee577df7...HEAD`, copiado do comando)
- src/lib/__tests__/safeStorage.adapter.test.ts
- src/lib/safeStorage.ts
