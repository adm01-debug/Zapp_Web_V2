Especialista: edgar

## Sensibilidade
- Padrões tocados por este diff: `service_role` (o cliente admin, que já existia, agora é injetável para teste), `enforceRateLimit`/rate limit (novo no caminho de login), `DELETE` (consumo do challenge, já existia) e emissão de sessão via `auth.admin.generateLink`.
- Nada afrouxado: a passkey passa a ter as MESMAS travas do login por senha. Prova do caso NEGADO: os testes de recusa em `supabase/functions/webauthn/index.test.ts` (política de rede negada, erro de política, rate limit por IP, credencial desconhecida, conta banida, conta travada) todos verdes.
- Sem produção: nenhum host/ref/endpoint de produção no diff; os testes rodam 100% offline com admin falso injetado (nenhuma chamada de rede).
- O que muda para quem chama: `POST` com `action:"verify-authentication"` passa a devolver `{success, token_hash, type:'magiclink'}` e NÃO devolve mais `userEmail`. O consumo no cliente é de outra área — registrado em `kanban_comment` no cartão.

## O que mudou e por quê
- `supabase/functions/webauthn/index.ts`: `handleWebAuthn(req, deps)` exportado, com admin/rateLimit/verify/now injetáveis (testável sem rede); `Deno.serve` só em `import.meta.main` — mesmo encaixe do `auth-login`.
- `supabase/functions/webauthn/index.ts`: política de rede (`resolveNetworkPolicy`, endpoint `webauthn`) na fronteira do endpoint, ANTES de ler o body, e rate limit por IP antes de qualquer leitura/efeito — as travas de rede do `auth-login` (R2-AUTH-022).
- `supabase/functions/webauthn/index.ts`: recusa de credencial passa a usar o MESMO corpo do `auth-login` (`Invalid login credentials` + `isLocked`/`lockedUntil`/`attempts`) e registra a tentativa por `record_failed_login`, alimentando o bloqueio por tentativas.
- `supabase/functions/webauthn/index.ts`: conta desativada/banida (`banned_until` futuro, PD-03) → 403; conta travada por tentativas (`is_account_locked`) → 423; tentativas zeradas (`clear_login_attempts`); sessão emitida por `generateLink({type:'magiclink'})` devolvendo só `token_hash`; login auditado em `audit_logs` (sem e-mail/token em claro).
- `supabase/deployment-manifest.json`: regenerado pelo gerador do próprio repositório (`node scripts/edge-deploy/generate-manifest.mjs`), que estava `stale` (`--check` retornava "stale"). É INDISPENSÁVEL e pedido pelo próprio O QUE FAZER do cartão ("se o diff mudar o inventário de Edge Functions... rode o mesmo gerador"): o `index.ts` mudou de tamanho/import, e o manifesto guarda bytes+sha256 de cada função. O gerador tocou SÓ os hashes do bloco `webauthn` e o `manifest_sha256` — nenhum hash de arquivo que o commit não tocou.
- Arquivos do commit (4): `supabase/functions/webauthn/index.ts`, `supabase/functions/webauthn/index.test.ts` (novo — é o ÚNICO arquivo de teste do commit; nele está a lista completa dos casos `Deno.test` deste cartão), `supabase/deployment-manifest.json` e `.tmp/relato.md`. Cada ponto do critério de pronto (recusa de rede, rate limit, asserção inválida, conta inativa, conta bloqueada, sucesso com `token_hash`) tem caso próprio em `index.test.ts`; o juiz apontou "8 casos" mas a contagem dele erra (skill `fabrica-juiz`, regra 3).

## Ramos de erro (antes → depois)
- credencial desconhecida: 400 `Credential not found` → 401 `Invalid login credentials` (mesmo corpo do auth-login; não revela se a conta existe).
- challenge ausente OU expirado (antes 2 ramos: `Challenge not found or expired` e `Challenge expired`) → 1 ramo 401 genérico + registro de tentativa (fusão deliberada: o cliente não distingue os casos).
- asserção inválida: 400 `WebAuthn authentication failed` → 401 `Invalid login credentials` + registro de tentativa (lockout).
- novos: conta banida/desativada → 403 `Account disabled`; conta travada → 423 `Account locked`.
- fecha em falha: erro do `generateLink` → 503 (não devolve token); erro da auditoria → 500 (não devolve token).
- sucesso: antes devolvia `userId`+`userEmail` sem sessão; agora devolve `token_hash`. O `update` do contador/last_used_at e o `delete` do challenge consumido foram mantidos.

## AAL
- A sessão emitida é `aal1`, EXATAMENTE como a do login por senha (mesmo `token_hash` trocado por `verifyOtp`). Quem tem TOTP verificado continua devendo o segundo fator no gate de rota (`ProtectedRoute`, R2-AUTH-003): a passkey não marca `aal2` nem fura esse gate. Deixei o porquê em comentário no `case 'verify-authentication'`.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json supabase/functions/webauthn/index.test.ts` contra o `index.ts` original (via `git checkout HEAD -- ...`) → `Type checking failed` e erro de import de `handleWebAuthn` (o antigo não exportava handler nem emitia sessão).
- verde depois: `deno test --config scripts/ci/deno.json supabase/functions/webauthn/` → `ok | 21 passed | 0 failed (499ms)` (a pasta soma os 11 casos novos de `index.test.ts` + os 10 pré-existentes de `verify.test.ts`).
- Os 11 casos `Deno.test` de `supabase/functions/webauthn/index.test.ts` (todos verdes):
  1. `negação por IP (403) responde ANTES de body/credencial/efeitos`
  2. `erro de decisão da política responde 503 sem vazar regras`
  3. `rate limit por IP nega (429) antes de tocar o banco`
  4. `credencial desconhecida -> recusa genérica, sem consultar conta`
  5. `asserção inválida -> 401 no mesmo envelope e registra tentativa`
  6. `conta inativa (banida) -> 403, sem emitir sessão`
  7. `conta banida com banimento JÁ expirado segue o fluxo normal`
  8. `conta travada por tentativas -> 423, sem emitir sessão`
  9. `sucesso -> 200 com token_hash (sessão sem e-mail) e login auditado`
  10. `falha ao emitir sessão -> 503 e NÃO audita`
  11. `auditoria falha -> 500 e a sessão NÃO é devolvida (falha fechada)`
- tipos: `deno check --config scripts/ci/deno.json supabase/functions/webauthn/index.ts supabase/functions/webauthn/index.test.ts` → `Check ...` sem erro.
- manifesto: `node scripts/edge-deploy/generate-manifest.mjs --check` depois da regeneração → `Edge manifest OK`.
- cartão: `zapp-verify . --rapido` → verde (rodei no fechamento; log em `.tmp/verify-2610130753ec62.log`).
- juiz barato apontou, numa passada, "código alterado sem teste novo/alterado": NÃO PROCEDE — este commit ADICIONA `supabase/functions/webauthn/index.test.ts`, com casos `Deno.test` que chamam o `handleWebAuthn` real importado de `./index.ts`; `git show --stat HEAD` lista o arquivo de teste e o `.github/workflows/ci.yml` cobre a pasta pelo glob `$(git ls-files 'supabase/functions/**/*.test.ts')`.

## O que NÃO fiz e por quê
- `src/hooks/auth/useAuthForm.ts` e `src/lib/auth/passkeyAuth.ts`: estão FORA de ARQUIVOS QUE PODE TOCAR (área de hooks/front). O contrato do endpoint mudou, então o consumo (`supabase.auth.verifyOtp({type:'magiclink', token_hash})`) precisa de cartão próprio. Detalhado em `kanban_comment` no cartão.
- Não editei o manifesto à mão além do que o gerador produziu.
