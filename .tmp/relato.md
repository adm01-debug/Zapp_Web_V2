Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/lib/serverLogin.ts`: o status 429 da edge `auth-login` deixou de cair no ramo generico (`unavailable`, com o texto "Login temporariamente indisponivel. Tente novamente em instantes.") e passou a ter estado proprio (`rateLimited: true`) com mensagem propria de muitas tentativas. Era o defeito do cartao: rate limit lido como servico fora.
  - `RATE_LIMITED_MESSAGE` = "Muitas tentativas de login. Aguarde alguns minutos."; `rateLimitedMessage(segundos)` acrescenta a espera quando ela e conhecida ("Tente novamente em 45s." / "em 2 min.").
  - `parseRetryAfterSeconds(headers)`: le `Retry-After` em segundos ("45") ou em data HTTP; valor ilegivel, zero ou no passado vira `null` (nunca inventa espera).
  - O ramo do 429 NAO depende do corpo da resposta (um 429 de proxy/CDN vem HTML) e e respondido antes de conferir a senha — entao nao e senha errada, nao e lockout de conta e a mensagem e identica exista ou nao o e-mail.
  - O 429 carrega `lock` porque o contrato de `unavailable: false` exige `lock` (o chamador le sempre): vai com `attempts: 0`, para a tela de login nao exibir "N tentativas restantes antes do bloqueio" (`src/pages/Auth.tsx` so mostra o contador com `attempts > 0`) — o rate limit nao contou senha errada nenhuma.
  - A doc da funcao foi corrigida: ela dizia que 429 vira `unavailable`.
- `src/lib/__tests__/serverLogin.test.ts`: caso 429 saiu da lista `%s vira unavailable` (a expectativa ficou MAIS forte, nao mais fraca: agora 5 testes proprios) e ganhou cobertura: estado proprio e mensagem; nao e indisponivel nem lockout (`lock.isLocked` falso, `attempts` 0); a mensagem nao muda com o corpo da edge (nao revela conta) nem contem e-mail/conta/senha; `Retry-After` em segundos e em data HTTP; valor ilegivel/zero/passado nao vira espera; 429 sem JSON tambem.

## Prova
- vermelho antes (fonte da base `HEAD:src/lib/serverLogin.ts` + teste novo): `npx vitest run src/lib/__tests__/serverLogin.test.ts` -> `Test Files 1 failed (1)` / `Tests 4 failed | 11 passed (15)` (o caso `429 tem mensagem propria...` falha em `expect(r.unavailable).toBe(false)`)
- verde depois: `npx vitest run src/lib/__tests__/serverLogin.test.ts` -> `Test Files 1 passed (1)` / `Tests 16 passed (16)`
- chamadores do contrato: `npx vitest run src/services/__tests__/auth.service.signIn.test.ts src/hooks/__tests__/useAuth.test.tsx src/hooks/__tests__/useReauthentication.test.tsx src/__tests__/smoke.test.ts` -> `Test Files 4 passed (4)` / `Tests 20 passed (20)`
- `zapp-verify . --rapido` -> `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`
- caminho ate a tela (lido no codigo, nao alterado): `src/services/auth.service.ts` devolve `new Error(result.error)` no ramo `!unavailable` e `src/hooks/auth/useAuthForm.ts` mostra `error.message` no toast — a mensagem de muitas tentativas chega a pessoa com esse paragrafo, sem precisar de arquivo fora da lista do cartao.

## O que NÃO fiz e por quê
- Nao mexi em `src/services/auth.service.ts` nem em `src/hooks/auth/useReauthentication.ts`: a lista do cartao e `src/lib/serverLogin.ts` + testes. Fica registrado o buraco para o cartao dono do reauth (t_e4f28cd1, que ja reescreve aquele hook): o ramo generico dele devolve "Senha incorreta" para qualquer falha que nao seja `unavailable` nem lock. Para um 429 no reauth a mensagem certa e a de muitas tentativas — basta subir o sinal `rateLimited` ate `SignInResult`.
- Nao trouxe a faixa do NP1 (t_3f45844b, 403/503): ele foi retirado pelo limpador e o meu workspace ja parte da `dia/2026-10-13` sem ele. O meu diff e aditivo e paralelo ao dele: uma linha nova no union, uma linha nova na doc e um ramo novo (429) antes do `return` generico. Na integracao, o union fica com as duas linhas e a ordem dos ramos e 403/503 (dele) e 429 (meu), sem sobreposicao.
- Nao envia Retry-After hoje (registro para o edgar): `supabase/functions/_shared/validation.ts` (`errorResponse`) responde 429 SEM `Retry-After`, e o CORS expoe so `x-request-id, x-degraded` em `Access-Control-Expose-Headers` — mesmo que a edge passe a mandar o header, o navegador nao consegue ler. Por isso a mensagem cai na generica "Aguarde alguns minutos" ate a edge expor o header (as duas coisas sao da edge).
