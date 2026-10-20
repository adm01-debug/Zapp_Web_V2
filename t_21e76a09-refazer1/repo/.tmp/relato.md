Especialista: senior
## O que mudou e por quê
- `supabase/functions/post-login-gate/index.test.ts` (import, linha 24; teste novo, linha 162): prova de paridade canônica da recusa 403 — o teste chama a função REAL `networkPolicyDenialResponse` de `supabase/functions/_shared/request-policy.ts` (a mesma que o `auth-login` chama) e exige corpo+status idênticos nas duas recusas 403 do porteiro (rede negada IP/país e conta inativa). Sem este teste, uma deriva futura do literal passaria silenciosa.
- `supabase/functions/post-login-gate/index.ts`: inalterado (sha igual ao da entrega recusada). `docs/adr/ADR-007-porteiro-pos-login.md`: inalterado.

## Prova
- Verde depois (Edge, código real + _shared real da dia/2026-10-14): `deno test --config ../../../deno.json --allow-net=127.0.0.1 index.test.ts` → `ok | 11 passed | 0 failed`
- Vermelho por mutação (mesmo comando, `--filter "idêntica à canônica"`, com o literal trocado de forma transitória em `index.ts`): `FAILED | 0 passed | 1 failed` em `index.test.ts:162:6` (asserção de corpo, linha 176); após reverter, `ok | 11 passed | 0 failed` e `index.ts` voltou ao sha original.
- Chamadores reais (vitest, tela/hook reais, só fronteira mockada): `vitest run --config vitest.config.ts src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx src/hooks/auth/__tests__/useAuthForm.email.test.tsx src/hooks/auth/__tests__/useAuthForm.senha.test.tsx src/hooks/auth/__tests__/useAuthForm.passkey.test.tsx` → `Test Files 4 passed (4)` + `Tests 15 passed (15)`

## Pontos do revisor
- Ponto 1: não procede como escrito, com prova. Os nomes da integração (`SocialLoginButtons`, `resolveSocialGateDecision`, `AuthCallback`, `useGoogleOAuth`, `Login`, `exchangeCodeForSession`) não existem em nenhuma branch nem em nenhum commit (`git grep` na `dia/2026-10-14`, na branch da entrega e na irmã + `git log --all -S` retornam vazio). A entrada Google real é `useAuthForm.handleGoogleLogin` (`supabase.auth.signInWithOAuth`, `src/hooks/auth/useAuthForm.ts:190`) e nenhum arquivo de `src` da base chama a Edge (grep `post-login-gate` em `src` retorna vazio; a chamada no retorno do SSO é do cartão-irmão `t_1479b19c`, em andamento). Não criei a integração porque ela exigiria arquivos fora dos permitidos, é área de front e seria comportamento a mais. No lugar, colei as DUAS saídas reais: Edge (`ok | 11 passed | 0 failed`) + chamadores reais (`Test Files 4 passed (4)`, `Tests 15 passed (15)`).
- Ponto 2: resolvido — `supabase/functions/post-login-gate/index.test.ts:162` (`recusa 403 do porteiro é idêntica à canônica do login (corpo+status)`). Verificação executada: a recusa do porteiro já sai byte-idêntica à do login (ambas via `errorResponse("Access denied", 403, req)`; o 503 indecidível já chamava `networkPolicyDenialResponse` no código, `index.ts:171`). O teste novo compara `status` + corpo contra a saída REAL da função canônica nos 3 caminhos 403; vermelho por mutação e verde revertido acima.
- Ponto 3: nada a mudar, com prova. Não existe `getAllowedProviders` em nenhuma branch/commit, nem Edge `sso-callback` (`git ls-tree` vazio; `git log --all -S` vazio) — não há mock a corrigir. Rerun do teste do sso-callback existente (`SSOCallback.erro-sanitizado.test.tsx`, sem nenhuma alteração nele) incluído no verde acima (`Test Files 4 passed (4)`). Zero arquivos de sso-callback no pacote.

## O que NÃO fiz e por quê
- Não criei `SocialLoginButtons`/`resolveSocialGateDecision` nem wiring front→Edge: fora dos arquivos permitidos, área do designer e comportamento a mais.
- Não alterei nada de sso-callback/SSO: o cartão manda não mudar nada ali.
- Não alterei `index.ts` nem o ADR: o código já estava correto contra a `_shared` atual (11/11 verde); o diff desta entrega é só o teste novo.

## FAIXA DO PAI
- Arquivos-base vindos do commit `55ee02276` do cartão `t_5f904bf8` (transferência auditada por sha256, hashes iguais). Minha mudança contra esse commit: SÓ `supabase/functions/post-login-gate/index.test.ts` (+1 import, +1 teste). `_shared` da `dia/2026-10-14` e `scratch-ssocb/` foram só andaime de execução, fora do pacote.

## Como entregar
- `hermes-tarefa-fechar` indisponível nesta sessão (scripts devolvem CONGELADO: modo V1 suspenso, sem `MODO_V2`). Entrega pelo pacote: `.tmp/patch/` com os 3 arquivos + este relato.
