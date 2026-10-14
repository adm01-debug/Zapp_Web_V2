Especialista: iris
Especialista: Íris (area-front-componentes)

## O que mudou e por quê

- `src/pages/SSOCallback.tsx`: o retorno do login social (Google/`signInWithOAuth` e link por e-mail/OTP) criava sessão e entrava no app sem passar pelo porteiro pós-login (ADR-007). Agora, assim que a sessão chega (`getSession` ou `SIGNED_IN`), a tela consulta a Edge `post-login-gate` (`supabase.functions.invoke('post-login-gate', { method: 'POST' })`) e só então decide:
  - `{ allowed: true }` → anuncia o sucesso e navega para o destino (comportamento de antes, preservado);
  - qualquer outra coisa (403 do porteiro, 503 indecidível, erro de rede, promessa rejeitada ou corpo sem `allowed: true`) → **falha fechada**: mensagem genérica `ACESSO_NEGADO` (já existente, em pt-BR, sem citar rede/país/conta inativa), `toast.error('Erro no login SSO')`, `supabase.auth.signOut()` para encerrar a sessão local e `navigate('/auth', { replace: true })`.
  - Nada é anunciado nem navegado antes da liberação do porteiro; a consulta roda uma única vez por montagem (`porteiroConsultadoRef`, mesmo quando `getSession` e `SIGNED_IN` chegam juntos) e o `SIGNED_OUT` que a própria negação dispara não reclassifica a tela (`porteiroNegouRef`).
  - O ref `loginConcluidoRef`, que fazia o mesmo papel de guarda de execução única, saiu: com o porteiro a guarda passou a ser a consulta única, e deixá-lo seria guarda morta (escrito e nunca lido).
- `src/pages/__tests__/SSOCallback.porteiro-pos-login.test.tsx` (novo): prova do fluxo do porteiro na tela real — liberado entra; 403 recusa; indisponível (promessa rejeitada) recusa; uma única consulta; nenhuma mensagem vaza o motivo; volta para `/auth`.
- `src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx`: o componente passou a depender de `supabase.functions` e de `auth.signOut`; o mock do teste existente foi completado (`functions.invoke`, `auth.signOut`) com o porteiro liberando por padrão, e a espera da cadeia `getSession → porteiro → setStatus` virou o helper `assentarFluxo()`. Nenhuma asserção foi afrouxada ou removida.

FAIXA DO PAI: commits a1ffcde343 (ADR-007 + Edge `post-login-gate` + testes, do cartão t_5f904bf8) e d8c6ae5fd3 (retorno do login social em pt-BR/acessível, do cartão t_f7e0f50f) — trazidos por cherry-pick do que já estava feito; não são deste cartão.

## Prova

- vermelho antes: `git show 338a420d1e:src/pages/SSOCallback.tsx > src/pages/SSOCallback.tsx && npx vitest run src/pages/__tests__/SSOCallback.porteiro-pos-login.test.tsx` → `Test Files 1 failed (1); Tests 5 failed | 1 passed (6)` (a tela sem porteiro entra com qualquer sessão: as 3 recusas, a consulta única e o caminho liberado falham).
- verde depois: `npx vitest run src/pages/__tests__/SSOCallback.porteiro-pos-login.test.tsx src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx` → `Test Files 2 passed (2); Tests 17 passed (17)`.
- tipagem: `npx tsc --noEmit -p tsconfig.app.json` → nenhum erro em `SSOCallback`.
- verificação do cartão: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos (146s)`, `OK lint`, `OK migrations`; linha final `VERIFY: VERDE SEM BANCO (151s) — o banco NÃO foi verificado; sem nome de conjunto` (este cartão não toca banco).
- comando e resultado completos no bloco FATOS MEDIDOS do fechar.

## O que NÃO fiz e por quê

- Não toquei na Edge `post-login-gate` nem no ADR-007: vieram prontos do cartão pai (t_5f904bf8) e a decisão (política de rede, conta ativa, 403/503) é do servidor.
- O retorno do link por e-mail que cai em `/` (fora do `SSOCallback`) e o caminho de senha (`auth-login`) não estão neste cartão; o de senha já passa pelo porteiro no servidor. Registro aqui como achado fora do escopo: nenhuma tela chamava `post-login-gate` antes deste diff (verificado com `git grep -n "post-login-gate" -- src`, que só achava a Edge e o teste dela).
