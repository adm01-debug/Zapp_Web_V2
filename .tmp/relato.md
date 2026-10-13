Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/auth/useWebAuthn.ts: `authenticateWithPasskey` passa a devolver `token_hash` (contrato da Edge PH-01) e não anuncia mais "Autenticado com passkey!" — antes devolvia `userId`/`userEmail` (a Edge deixou de devolver ambos) e o toast de sucesso prometia login sem sessão nenhuma.
- src/hooks/auth/useAuthForm.ts (`handlePasskeyLogin`): troca `supabase.auth.signInWithOtp` (que só ENVIAVA o link por e-mail e não criava sessão) por `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`; só anuncia e navega quando `data.session` existe. Falha ou ausência de sessão → recusa genérica em pt-BR, sem revelar se a conta existe.
- Guarda removida de propósito: a comparação `session.user.id === result.userId` já não tem lado direito — a Edge PH-01 não devolve `userId`; a prova do login passa a ser a própria sessão criada pelo token de uso único do `verifyOtp`.
- src/hooks/auth/__tests__/useAuthForm.passkey.test.tsx: reescrito para o canal novo (6 casos: caminho padrão, sessão ausente, erro do `verifyOtp` com mensagem genérica, passkey negada, resposta sem `token_hash`, destino `?next=` respeitado).

## Prova
- vermelho antes: `npx vitest run src/hooks/auth/__tests__/useAuthForm.passkey.test.tsx` → `Tests 3 failed | 3 passed (6)` (ex.: `AssertionError: expected "vi.fn()" to be called with arguments: [ '/inbox' ]` — o `verifyOtp` não era chamado).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 6 passed (6)`.
- regressão da área: `npx vitest run src/hooks/auth/__tests__/ src/hooks/__tests__/useWebAuthn.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx` → `Test Files 7 passed (7); Tests 32 passed (32)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (162s)`.

## O que NÃO fiz e por quê
- Não toquei na Edge `supabase/functions/webauthn/index.ts` (área do PH-01): trouxe os 3 commits do pai por cherry-pick (6c022a2e95, 90575dada9, 5c2362a934) porque `git merge-base --is-ancestor ce37605ea HEAD` era falso.
- Sem migration e sem dependência nova (cartão de front).
