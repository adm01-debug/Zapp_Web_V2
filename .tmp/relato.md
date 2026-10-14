Especialista: hugo
## O que mudou e por quê
- src/hooks/connections/useConnectionDropAlerts.ts: marca todo evento processado como visto (`connectionId + at`) antes de decidir — suprimido por silêncio, preferência, idade ou reconexão nunca volta em rajada; só o evento retido com papel ainda carregando é reapresentado quando o papel resolve staff. Queda mais antiga que a janela ou com snapshot atual `connected`/`healthy` é ignorada. A preferência do navegador regula só `showBrowserNotification`; o toast continua para staff fora do silêncio. Opção nova `now` (default `Date.now`) para medir a idade da queda de forma determinística.
- src/hooks/connections/__tests__/useConnectionDropAlerts.test.ts: relógio do hook ligado ao do store; teste da preferência do navegador ajustado (pede toast sim + navegador não); 4 testes novos dos pontos 1, 2 e 4 da recusa.
## Prova
- vermelho antes (hook antigo + testes novos): `npx vitest run src/hooks/connections/__tests__/useConnectionDropAlerts.test.ts` → `Tests 5 failed | 9 passed (14)`
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 14 passed (14)`
- regressão na pilha: `npx vitest run src/hooks/connections src/providers src/components/monitoring` → `Test Files 10 passed (10); Tests 104 passed (104)`; `npx vitest run src/components/layout src/components/team-chat src/pages` → `Test Files 49 passed (49); Tests 378 passed (378)`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint, migrations OK; sem banco porque o cartão não tem migration)
## Pontos do revisor
- Ponto 1: resolvido — `seenRef` marca o evento antes de qualquer `continue` (suprimido não volta); o `return` com papel não-staff marca nada, então só o evento retido no carregamento do papel é reapresentado. Teste: `queda no silêncio não vira rajada quando o silêncio acaba`.
- Ponto 2: resolvido — `now() - event.at >= DROP_ALERT_DEDUP_MS` ignora queda velha; `connections.some(c => c.id === ... && c.healthy)` ignora conexão que já voltou. Testes: `queda mais antiga que a janela não é reapresentada quando o papel resolve` e `queda seguida de reconexão antes do papel resolver não avisa`.
- Ponto 3: resolvido — sem `allowBrowser` único; toast sai para staff fora do silêncio e `showBrowserNotification` sai só com `settings.browserNotifications`. Teste: `preferência do navegador desligada: toast dentro do app sim, notificação do navegador não`. Segui o cartão, sem decisão diferente.
- Ponto 4: resolvido — os 4 testes (a)(b)(c)(d) estão no arquivo acima; o teste antigo `não avisa quando o usuário desligou a notificação no navegador` foi ajustado para o comportamento do ponto 3.
- Ponto 5: este relato, com as provas acima.
## Critério 1 do aceite
- Cobertura total do arquivo do hook na sua suíte (14 testes, todos passando, saída acima); regressão verde nos diretórios da pilha (saídas acima); chamadores do hook: só `src/providers/AppProviders.tsx`, que chama sem opções e segue compilando (opção nova é opcional).
## O que NÃO fiz e por quê
- Não mexi em `AppProviders.tsx`, store, gate, sons nem manifesto: o cartão cita só hook + teste e a correção coube neles.
