Especialista: iris

## Contexto do defeito (evidência do cartão)
`src/pages/ResetPassword.tsx` chamava `supabase.auth.updateUser({ password })` numa sessão `PASSWORD_RECOVERY` AAL1: com TOTP verificado o GoTrue recusa com `insufficient_aal` e a tela só dizia "Erro ao alterar senha", sem pedir o código. Depois da troca a tela também não encerrava as outras sessões — quem ficou com a sessão antiga continuava dentro (a Edge `revoke-auth-sessions` já aceita `scope: 'others'`, conferido em `supabase/functions/revoke-auth-sessions/index.ts:25`).

## O que mudou e por quê
- `src/pages/ResetPassword.tsx`: portão do 2º fator antes do formulário. Depois de a sessão ser confirmada, a página lê `getAuthenticatorAssuranceLevel()`; com `nextLevel: 'aal2'` e `currentLevel !== 'aal2'` a tela mostra o desafio `MFAVerify` (TOTP) e só libera o formulário depois do código certo. Se o `updateUser` voltar com `code: 'insufficient_aal'` (ou a mensagem "AAL2 session is required"), a tela volta ao desafio com mensagem clara em vez do erro cru. Se a leitura do nível falhar (retorno `null`), a troca fica BLOQUEADA e a tela mostra "Não foi possível confirmar a verificação em duas etapas" com botão "Tentar novamente" — sem saber o nível, não escrevemos senha.
- `src/pages/ResetPassword.tsx`: depois do `updateUser` com sucesso, chama `supabase.functions.invoke('revoke-auth-sessions', { body: { scope: 'others' } })`. Sucesso ⇒ aviso na tela "As outras sessões desta conta foram encerradas." + `toast.success`; falha ⇒ aviso vermelho com `role="alert"` ("...não foi possível encerrar as outras sessões...") + `toast.error`, e o texto de sucesso NÃO afirma que encerrou.
- `src/components/security/SecuritySettingsPanel.tsx`: o item "Alterar Senha" (`change_password`) passa a navegar pelo router (`navigate('/reset-password')`) em vez de `window.location.href`. O reload duro descartava o estado da sessão que a tela de destino usa para ler o AAL; com isto o fluxo logado cai na MESMA tela, que agora exige o 2º fator e encerra as outras sessões.
- Estados da tela alterada: carregando → "Verificando link de recuperação…" e depois "Verificando verificação em duas etapas…" (ambos em `role="status"`/`aria-live`); erro do nível → cartão de erro com retry; sessão não confirmada → "Link Inválido" (trabalho do PH-05 preservado).

## FAIXA DO PAI
FAIXA DO PAI: commit `c3458427a8` (fix(auth): tela de redefinir senha sem link invalido falso e senha vazada barrada) do cartão `t_148b3c50` (PH-05) — não é deste cartão. O cartão manda trazer a faixa; `git merge-base --is-ancestor 3025c3b4a HEAD` era falso, então foi cherry-pickada inteira.

## Prova
- vermelho antes: `npx vitest run src/pages/__tests__/ResetPassword.segundo-fator-sessoes.test.tsx` na base `dia/2026-10-14` (sem a mudança) → o desafio TOTP não aparece e `revoke-auth-sessions` nunca é chamado (falha). Linha exata no bloco FATOS MEDIDOS PELO FECHAR (prova vermelho→verde dos testes alterados).
- verde depois: `npx vitest run src/pages/__tests__/ResetPassword.segundo-fator-sessoes.test.tsx src/pages/__tests__/ResetPassword.acessivel.test.tsx src/pages/__tests__/ResetPassword.redirect-cancelavel.test.tsx src/components/security/__tests__/SecuritySettingsPanel.medicao.test.tsx` → `Test Files 4 passed (4); Tests 17 passed (17)` (rodados agora, antes o mesmo conjunto era 11 testes em 3 arquivos).
- verificação do cartão: `zapp-verify . --rapido` → `OK db_guard`; `OK tipos`; `OK lint`; `OK migrations`; `VERIFY: VERDE SEM BANCO`. O lint ratchet no commit: `baseline=1, atual=1, novas=0`.

## Testes
- NOVO `src/pages/__tests__/ResetPassword.segundo-fator-sessoes.test.tsx` (6 testes, renderizam a página REAL com o cliente Supabase mockado): desafio TOTP antes do formulário e formulário depois do código certo; erro na leitura do nível bloqueia a troca e o retry libera; sucesso chama a Edge com `scope: 'others'` e mostra o aviso de sessões encerradas; falha da Edge mostra o alerta na tela e não afirma ter encerrado; `insufficient_aal` volta ao desafio sem passar por sucesso; entrada logada (sem `PASSWORD_RECOVERY`) usa a mesma tela.
- Ajustados (mock do cliente ganhou `auth.mfa`/`auth.signOut`/`functions.invoke`, sem afrouxar asserção): `ResetPassword.acessivel.test.tsx`, `ResetPassword.redirect-cancelavel.test.tsx`.
- `SecuritySettingsPanel.medicao.test.tsx`: os dois testes existentes agora renderizam dentro de `MemoryRouter` e um teste novo prova que "Alterar Senha" navega para a rota `/reset-password`.

## O que NÃO fiz e por quê
- Nenhum SQL/migration: nada aqui decide estado no banco; a Edge `revoke-auth-sessions` já existia com `scope: 'others'`.
- Não rodei E2E contra o Auth local: o cartão registra que o GoTrue real não estava acessível; a recusa `insufficient_aal` é o contrato documentado em `node_modules/@supabase/auth-js/src/lib/error-codes.ts` e está coberta no teste da tela real.
- Nada fora dos arquivos do cartão.
