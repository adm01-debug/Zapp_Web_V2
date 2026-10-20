Especialista: iris

## O que é este cartão
`[refazer 1]` do cartão t_af333f67. A primeira linha acima é a que o PEDIDO ORIGINAL exige ao pé da letra
("A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`"). Aqui só o RELATO foi
reescrito: a recusa diz que o código está correto e dentro da área, e eu não alterei uma linha de código.
Workspace: branch `v2/acessibilidade-auth-boot-refazer1-261013065760c9`; o diff do cartão (base do dia
`dia/2026-10-13`, commit base `96dd72dc5f`) tem 23 arquivos — os números de arquivo estão no Ponto 2.

## O que o código faz (herdado, reconferido)
- `src/components/auth/PasswordInput.tsx`: tira o `tabIndex` negativo do botão de mostrar senha; ele volta à
  ordem de tabulação do teclado.
- `src/components/auth/ProtectedRoute.tsx`: tela de erro de boot com ações ("Tentar de novo" e "Sair"),
  com logout aguardado, em vez de redirecionar sem saída.
- `src/components/auth/ReauthDialog.tsx`, `src/components/mfa/MFAVerify.tsx` e `MFAEnroll.tsx`: nome
  acessível no botão de mostrar senha, erro em `role=alert`, verificação em `role=status`, campo com
  `autocomplete=one-time-code` ligado ao erro.
- `src/pages/ForgotPassword.tsx`, `ResetPassword.tsx`, `TwoFactorAuth.tsx`: `<main>` como landmark e os
  erros anunciados (`role=alert` / `role=status`), como as telas de login já faziam.

## Prova (medida por máquina neste workspace; nenhum número escrito à mão)
Comando (os 10 arquivos de teste do cartão):
`npx vitest run src/components/auth/__tests__/PasswordInput.a11y.test.tsx src/components/auth/__tests__/ProtectedRoute.boot-erro.test.tsx src/components/auth/__tests__/ProtectedRoute.logout-aguardado.test.tsx src/components/auth/__tests__/ReauthDialog.a11y.test.tsx src/components/mfa/__tests__/MFAVerify.a11y.test.tsx src/pages/__tests__/auth-telas-a11y.test.tsx src/hooks/auth/__tests__/useAuth.bootstrap-erro.test.tsx src/hooks/auth/__tests__/useAuthForm.passkey.test.tsx src/hooks/system/__tests__/useUserRole.realtime.test.tsx src/lib/__tests__/safeStorage.adapter.test.ts`
- vermelho antes (fontes do cartão voltadas à base `96dd72dc5f`):
  `Test Files  9 failed | 1 passed (10)` e `Tests  26 failed | 11 passed (37)` — log `.tmp/vitest-base.log`.
- verde depois (HEAD):
  `Test Files  10 passed (10)` e `Tests  37 passed (37)` — log `.tmp/vitest-fechar.log`.
- É exatamente a linha que o próprio portão mede, em `.tmp/fatos-fechar.md`: "Testes alterados neste
  cartão (10 arquivo[s]) ... Test Files 10 passed (10);Tests 37 passed (37)" e "Prova vermelho→verde dos
  testes alterados: falham na base e passam no seu commit (vermelho → verde)".

## Resposta aos 5 pontos da recusa
- Ponto 1 (prova vermelho→verde): FOI rodada contra a base e está transcrita acima (26 falhas de 37 com as
  fontes na base `96dd72dc5f`; 37/37 no HEAD), com os logs `.tmp/vitest-base.log` e `.tmp/vitest-fechar.log`.
  O "vermelho antes" não é dedução das asserções: são as linhas de contagem de falha impressas pelo vitest
  na base, e o próprio fechar as confirma em `.tmp/fatos-fechar.md`.
- Ponto 2 (frase verdadeira sobre a faixa do pai): a frase "nenhum arquivo fora da lista foi tocado" NÃO
  existe mais. O que é verdade: o commit DESTE cartão só tocou arquivos da lista. Os 23 arquivos do diff
  têm 4 origens: (a) 8 fontes da lista — PasswordInput.tsx, ProtectedRoute.tsx, ReauthDialog.tsx,
  MFAEnroll.tsx, MFAVerify.tsx, ForgotPassword.tsx, ResetPassword.tsx, TwoFactorAuth.tsx; (b) 5 testes da
  lista — PasswordInput.a11y, ProtectedRoute.boot-erro, ReauthDialog.a11y, MFAVerify.a11y, auth-telas-a11y;
  (c) 9 arquivos da FAIXA DO PAI t_466d669c (cherry-pick), FORA da lista — src/hooks/auth/useAuth.tsx,
  src/hooks/system/useUserRole.ts, src/integrations/supabase/client.ts, src/lib/safeStorage.ts,
  src/hooks/__tests__/useUserRole.test.tsx, src/hooks/auth/__tests__/useAuth.bootstrap-erro.test.tsx,
  src/hooks/system/__tests__/useUserRole.realtime.test.tsx, src/lib/__tests__/safeStorage.adapter.test.ts,
  src/components/auth/__tests__/ProtectedRoute.logout-aguardado.test.tsx; (d) 1 remoção de `.tmp/relato.md`
  (Ponto 4). 8+5+9+1 = 23. Os 9 da faixa do pai vieram por `git cherry-pick` porque o cartão manda
  ("aproveite, não recomece") e não afrouxam segurança; MFAEnroll.tsx, que o aviso do juiz listou como fora,
  na verdade ESTÁ na lista do cartão (`src/components/mfa/MFAVerify.tsx, MFAEnroll.tsx`). O diff é grande
  (62374 caracteres) justamente porque carrega esses 9 arquivos herdados; nada disso é edição minha.
- Ponto 3 (capturas claro/escuro, 360 a 1280 px): NÃO foram feitas e não existe captura minha neste cartão.
  Motivo: a prova deste cartão é de SEMÂNTICA acessível (role/aria/ordem de tabulação/axe), medida em jsdom,
  não de pixel; o workspace da tarefa não tem navegador nem dev server, e a regra da fábrica proíbe
  versionar captura no mesmo cartão do defeito. Não afirmo recorte de tela nenhum; a prova é a execução
  vermelho→verde acima.
- Ponto 4 (de onde veio a remoção de `.tmp/relato.md`): veio da FAIXA DO PAI t_466d669c. É o commit
  `chore(auth): deixa o relato da tarefa fora do versionamento`, que é o HEAD do pai (sha do pai =
  `95ee577df7`), trazido para este workspace por cherry-pick como `e177fd0bf4` (data de autor `01:33:40`
  preservada; data de commit `06:58:25`). Ele apagou um `.tmp/relato.md` que JÁ estava versionado na base
  do dia: `git ls-tree dia/2026-10-13 .tmp/relato.md` devolve o blob `02eed3a930` (modo 100644), e o
  conteúdo apagado é o relato de OUTRO cartão — ErrorBoundary/AppProviders, especialista Hugo (o arquivo
  começa com "Especialista: Hugo (area-front-hooks)"), cuja última alteração na branch do dia é o commit
  `0ca0e1c4df` "fix(app): auto-recuperacao zera contador e limpa erro ao trocar de rota". Ou seja: não é
  mudança de outro cartão nem trabalho meu — é a limpeza, feita pela faixa do pai, de um relato alheio que
  ficou versionado na base do dia antes de `.tmp/` entrar no `.gitignore`. Hoje `.tmp/relato.md` é ignorado
  e este relato não entra no diff.
- Ponto 5 (linha de resultado): a linha medida pela máquina, com o escopo dos 10 arquivos de teste do
  cartão, é `Test Files 10 passed (10); Tests 37 passed (37)`. É ESSA a linha deste relato. Os valores
  antigos "5/17" e "13/75" foram REMOVIDOS: não são o resultado deste cartão (5/17 era um subconjunto de 5
  testes a11y; 13/75 não é reproduzível por nenhum comando deste workspace) e número que eu não reexecuto
  não entra no relato.

## O que NÃO fiz e por quê
- Não toquei banco, Edge Function, produção, credenciais nem `.github/`.
- Não inventei captura de tela nem afirmação de pixel (Ponto 3).
- Não alterei o código: a recusa diz que ele está correto e dentro da área; mexer nele seria risco sem causa.
- Não criei arquivo novo versionado: o diff é o do cartão anterior; este relato é ignorado pelo git.
