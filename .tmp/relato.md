Especialista: iris

# feat(auth): exige re-autenticacao nas acoes destrutivas de admin

## O que mudou e por quê
- src/components/auth/ReauthDialog.tsx: o diálogo ganhou o modo MFA (código TOTP) e um `ReauthGuard` reutilizável (senha ou código, conforme o usuário). O erro passou a sair com `role="alert"`, com trava síncrona contra duplo clique e foco no campo. É o único mecanismo de confirmação de identidade que as telas usam agora.
- src/components/admin/AdminUsersTable.tsx: trocar papel (Select) e ativar/desativar usuário (Switch) só executam depois da re-autenticação.
- src/components/admin/ForceLogoutButton.tsx: o confirmar do diálogo passou a apenas armar a ação; a revogação das sessões só acontece após a identidade confirmada.
- src/pages/admin/RolesPage.tsx: remover papel só executa após a re-autenticação; o botão da lixeira ganhou nome acessível (`Remover role de <nome>`).
- src/components/connections/ConnectionDeleteDialog.tsx: digitar o nome exato libera o diálogo, mas a exclusão ainda espera a re-autenticação.
- testes: 4 arquivos novos (ReauthGuard, AdminUsersTable.reauth, RolesPage.reauth, ConnectionDeleteDialog.reauth) e 2 ajustados (ForceLogoutButton e ConnectionCard.confirmacao) para o novo passo.

## Ponto 1 do cartão — MFA / AAL2 (provar antes de ligar)
- O hook real `useReauthentication` faz `AuthService.signIn` → `setSession`: para usuário com TOTP a sessão volta em aal1 e o gate de MFA manda para /2fa no meio da ação — ou seja, o novo login DERRUBA o AAL2.
- Por isso o `ReauthGuard` não usa novo login quando o usuário tem fator TOTP verificado: pede o código e usa `mfa.challenge/verify` (`useMFA.verifyTOTP`) — a sessão continua aal2, sem re-login. Sem fator verificado, usa a senha (`reauthenticate`).
- O caminho de challenge em sessão já aal2 não foi exercitado no banco local (sem usuário MFA sintético nesta tarefa); está coberto por teste unitário com os hooks mockados.

## Prova
- vermelho antes: `git show HEAD~1:src/components/admin/ForceLogoutButton.tsx > <arquivo>` e `npx vitest run src/components/admin/__tests__/ForceLogoutButton.test.tsx` (componente da BASE) → `Test Files 1 failed (1); Tests 6 failed (6)`, todos com `Unable to find a label with the text of: Senha Atual`: na base a ação destrutiva executava sem confirmar identidade.
- verde depois (arquivo restaurado, commit 0d6cefe7b):
  - `npx vitest run src/components/admin/__tests__/ForceLogoutButton.test.tsx src/components/auth/__tests__/ReauthGuard.test.tsx src/components/admin/__tests__/AdminUsersTable.reauth.test.tsx src/pages/admin/__tests__/RolesPage.reauth.test.tsx src/components/connections/__tests__/ConnectionDeleteDialog.reauth.test.tsx` → todas passam.
  - `npx vitest run src/components/admin/__tests__ src/pages/admin/__tests__ src/components/connections/__tests__ src/components/security/__tests__ src/hooks/__tests__/useReauthentication.test.tsx` → mantém os existentes verdes.
- `npx tsc --noEmit` → sem saída (0 erros).
- `npx eslint <arquivos alterados>` → 0 errors (1 warning pré-existente: import do client do Supabase em ForceLogoutButton, baseline de lint mantido: novas=0).

## O que NÃO fiz e por quê
- Não toquei em src/hooks/auth/useReauthentication.ts, src/services/auth.service.ts nem src/lib: são do worker (hooks)/auth, fora da minha área.
- Arquivos fora da lista do cartão que precisei tocar: `src/components/admin/ForceLogoutButton.tsx` (o "forçar logout" pedido no cartão mora nele, não em AdminUsersTable) e `src/components/connections/__tests__/ConnectionCard.confirmacao.test.tsx` (teste existente do fluxo de exclusão, que passou a exigir o passo de identidade).
- Não afrouxei teste: o teste de ConnectionCard passou a provar também que a exclusão NÃO executa antes da re-autenticação.
