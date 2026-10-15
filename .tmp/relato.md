Especialista: semisenior (area-front-componentes)
## O que mudou e por quê
- `src/pages/Auth.tsx:26-43`: o valor de minutos dentro do `role="alert"` do bloqueio foi CONGELADO no início do bloqueio (`announcedLockMinutes`, via `useState` + `useRef` da transição `isLocked` false→true; zera ao desbloquear para um próximo bloqueio anunciar o valor novo). Antes, `lockMinutes = ceil(remainingTime/60)` era recalculado a cada segundo e o texto da região viva mudava 5→4→3… reanunciando em laço.
- `src/pages/__tests__/Auth.avisos-bloqueio.test.tsx:114-138`: teste novo com fake timers — `remainingTime` 300→239 (`advanceTimersByTime(61_000)`) e o texto do `role="alert"` permanece idêntico; a contagem visual `3:59` continua fora da região viva. Também `afterEach` com `cleanup()` + `useRealTimers()`.
## Prova
- vermelho antes (sem a correção, só com o teste novo): `npx vitest run src/pages/__tests__/Auth.avisos-bloqueio.test.tsx -t "congela o anúncio"` → `FAIL … expected '…Aguarde 5 minutos…' to be '…Aguarde 5 minutos…' // Object.is equality / Received: "…Aguarde 4 minutos antes de tentar novamente." / Test Files 1 failed (1), Tests 1 failed | 4 skipped (5)`
- verde depois: `npx vitest run src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` → `Test Files 1 passed (1), Tests 5 passed (5)`
- vizinhos de Auth intactos: `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` → `Test Files 4 passed (4), Tests 21 passed (21)`
- lint nos dois arquivos: `npx eslint src/pages/Auth.tsx src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` → 0 errors (1 warning pré-existente em `src/pages/Auth.tsx:13`, import `GOOGLE_OAUTH_ENABLED` restrito, já estava na base e não é deste cartão)
## Pontos do revisor ([refazer 1] da recusa do sha a55bf018af)
- Ponto 1 (congelar o valor anunciado): resolvido — `src/pages/Auth.tsx:32-43` (`announcedLockMinutes` setado só na transição para bloqueado, zerado ao desbloquear; `lockMinutes` usa o valor congelado com fallback para o cálculo). Mantive o número no anúncio (opção 1 da recusa), então o teste 1 existente ("Aguarde 5 minutos") continua passando.
- Ponto 2 (teste 300→239 com texto idêntico): resolvido — `src/pages/__tests__/Auth.avisos-bloqueio.test.tsx:114-138` (fake timers, `advanceTimersByTime(61_000)`); vermelho antes e verde depois acima.
- Ponto 3 (corrigir a afirmação "texto estável enquanto o bloqueio dura"): corrigido — o relato anterior afirmava estabilidade que o diff desmentia; este relato afirma o congelamento implementado neste diff (linhas citadas acima), não estabilidade por construção do `remainingTime`.
- Trecho da recusa "o restante está correto" (role="alert" nas tentativas, aria-hidden na contagem/barra, sem `is_account_locked`): não tocado, continua como estava.
## FAIXA DO PAI
FAIXA DO PAI: commits `4f00bb403b` (`src/lib/serverLogin.ts` + `src/lib/__tests__/serverLogin.test.ts`, 429 = "muitas tentativas") do cartão `t_48ac4716` — trazidos por ordem da seção DEPENDÊNCIA do cartão original, não são deste cartão. O MEU commit (`05cfb5344d`) toca só os 2 arquivos abaixo. A faixa do pai não é julgada aqui (a própria recusa diz).
## Arquivos do MEU commit (`git diff --name-only HEAD~1..HEAD`, copiada do comando)
```
src/pages/Auth.tsx
src/pages/__tests__/Auth.avisos-bloqueio.test.tsx
```
## O que NÃO fiz e por quê
- Não implementei pré-checagem de bloqueio por e-mail (`is_account_locked`): o cartão original manda não implementar (enumeração de contas); a recusa confirma que a ausência está correta.
- Não mexi em `src/hooks/auth/useAuthForm.ts` (o tick de 1s continua; só o anúncio foi congelado), nem em `src/components/ui/**`, nem em `serverLogin.ts` (faixa do pai).
## Verificação
```
$ npx vitest run src/pages/__tests__/Auth.avisos-bloqueio.test.tsx
Test Files 1 passed (1), Tests 5 passed (5)
$ npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx src/pages/__tests__/Auth.avisos-bloqueio.test.tsx
Test Files 4 passed (4), Tests 21 passed (21)
```
Commit: `05cfb5344d` (`fix(auth): congela minutos anunciados no bloqueio para leitores de tela (refazer 1 t_ef4b7fab)`) no workspace `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/fix-auth-avisos-bloqueio-leitores-tela-26101407357830`, branch `v2/fix-auth-avisos-bloqueio-leitores-tela-26101407357830`. `hermes-tarefa-fechar` bloqueado nesta sessão (CONGELADO sem MODO_V2, RC=75): entrega pelo Kanban.
