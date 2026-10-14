Especialista: iris

## O que mudou e por quê
- src/pages/SSOCallback.tsx: erros do provedor viram pt-BR. `traduzirErroAuth` mapeia
  `error_code`/`error` conhecidos (`signup_disabled`, `signups not allowed`, `user_banned`,
  `access_denied`, `server_error`) para texto em português; `sanitizeAuthError` mantém o corte
  de 200 caracteres e a remoção de caracteres de marcação para o que não é reconhecido.
  `getUrlError` passa a ler `error_code` antes de `error_description`/`error`.
- src/pages/SSOCallback.tsx: um único redirecionamento e um único toast. `concluirLogin` usa
  `loginConcluidoRef` para não repetir quando `getSession().then` e `onAuthStateChange(SIGNED_IN)`
  chegam os dois; o `setTimeout(navigate, 1500)` fica guardado em `redirecionamentoRef`.
- src/pages/SSOCallback.tsx: timers limpos ao desmontar — o cleanup do efeito limpa o timer de
  timeout e o de redirecionamento, com um flag `ativo` contra `setState` após desmontar.
- src/pages/SSOCallback.tsx: acessibilidade — wrapper passa a ser `<main>`; loading e sucesso com
  `role="status"`/`aria-live="polite"`, erro com `role="alert"`/`aria-live="assertive"`.
- src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx: provas novas renderizando a TELA real
  (sem exportar helper): tradução de `error_code=signup_disabled`, `user_banned`, `access_denied` e
  de 'Signups not allowed for this instance' por `error_description`; `role="alert"` no erro;
  sucesso com `role="status"`; navegação e toast de sucesso contados UMA vez quando `getSession` e
  `SIGNED_IN` disparam juntos; timer limpo ao desmontar (não navega depois do unmount).

## Prova
- vermelho antes: `git show HEAD~1:src/pages/SSOCallback.tsx > src/pages/SSOCallback.tsx && npx vitest run src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx`
  → `Test Files 1 failed (1); Tests 8 failed | 3 passed (11)` (os 3 antigos passam porque a
  sanitização já existia; os testes novos falham sem a correção).
- verde depois: `npx vitest run src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx`
  → `Test Files 1 passed (1); Tests 11 passed (11)`.

## Critério de pronto
1. Erros em pt-BR: `traduzirErroAuth` em src/pages/SSOCallback.tsx + testes de tradução (signup_disabled, user_banned, access_denied, 'Signups not allowed').
2. Uma navegação só: `loginConcluidoRef`/`redirecionamentoRef` em src/pages/SSOCallback.tsx + teste 'navega e avisa uma vez só quando getSession e SIGNED_IN chegam juntos'.
3. Anunciado a leitores de tela: `<main>` e `role="status"/"alert"` em src/pages/SSOCallback.tsx + testes de `role="alert"` e `role="status"`.
4. `zapp-verify . --rapido` verde: rodado pelo `hermes-tarefa-fechar`.

## O que NÃO fiz e por quê
- Nada fora dos dois arquivos listados no cartão.
