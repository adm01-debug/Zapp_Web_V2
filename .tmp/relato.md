## O que mudou e por quê
- supabase/functions/_shared/gmail-helpers.ts: o refresh recusado pelo Google (`ensureValidToken`) descartava o corpo da resposta e subia sempre "Failed to refresh token" — sem o `invalid_grant` a conta virava `error` mudo. Agora o corpo entra na mensagem; novas funções `isGmailReauthError`, `sanitizeGmailErrorMessage` e `recordGmailAccountFailure` classificam a falha: token revogado/expirado (`invalid_grant`, `unauthorized_client`) → `sync_status='reauth_required'`; falha transitória → `error` com a contagem de tentativas; `last_error` sempre sem token nem e-mail completo.
- supabase/functions/gmail-cron-sync/index.ts e gmail-sync/index.ts: os dois pontos que gravavam `sync_status='error'` passam a usar `recordGmailAccountFailure`. O ramo de sucesso não mudou (segue gravando `synced` e limpando `last_error`).
- supabase/functions/gmail-oauth/index.ts: o `exchange-code` já reconecta pela mesma linha (`upsert` com `onConflict: "email_address"`, UNIQUE(email_address)); agora também grava `last_error: null`, para a mensagem de reconexão sumir ao reconectar.
- Testes: `supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts` (novo) e `supabase/functions/gmail-oauth/index.test.ts` (ganhou a prova de reconexão).

## Escopo do diff (números reais)
- 7 arquivos no commit: 4 de código (`gmail-helpers.ts`, `gmail-cron-sync/index.ts`, `gmail-sync/index.ts`, `gmail-oauth/index.ts`), 2 de teste e este `.tmp/relato.md`.
- 2 arquivos de teste; 6 casos de teste novos: 5 em `gmail-reauth-required.test.ts` e 1 em `gmail-oauth/index.test.ts` (reconexão pela mesma linha).

## Sensibilidade
- (a) O diff toca o caminho de token/OAuth, mas não mexe em `rateLimit`, `requireRole`, `verifyHmac` nem `DELETE`; usa `service_role` só onde já era usado (funções de sincronização).
- (b) Nenhuma proteção afrouxada: nenhuma policy, nenhuma RPC, nenhum grant alterado. Nada de migração.
- (c) Nenhuma referência ao banco/endpoint de produção (as mudanças rodam no banco local da tarefa).
- (d) Para quem chama: a resposta 500 do `gmail-sync` e o campo `error` do lote do `gmail-cron-sync` agora vêm sanitizados (sem e-mail/token) — texto, não contrato de formato.

## Diagnóstico da conta em error (item 3)
A causa mais provável é o refresh token expirado/revogado (`invalid_grant`): com o código anterior isso chegava ao banco como "Failed to refresh token", indistinguível de falha de rede. Não consulto produção (regra R1), então não afirmo o estado da conta; o que entrego é a classificação, que faz o próximo ciclo do cron gravar `reauth_required` com o motivo do Google no `last_error`. A conta segue `is_active=true`, então o cron continua a tentar — reconectar (`gmail-oauth` `exchange-code`) volta a linha a `pending` e limpa o erro.

## Prova
- vermelho antes: `deno test --no-check .../gmail-reauth-required.test.ts` com `gmail-helpers.ts` original (git stash) → `FAILED | 0 passed | 1 failed`
- verde depois: `deno test --config scripts/ci/deno.json --allow-env --allow-net --allow-read .../gmail-reauth-required.test.ts .../gmail-oauth/index.test.ts .../gmail-helpers.test.ts` → `ok | 34 passed | 0 failed`

## Ramo de erro (antes → depois)
- `gmail-cron-sync` catch: antes `update({sync_status:'error', last_error: msg})` com a mensagem crua (o corpo do Google podia trazer o endereço) e `return {id, error: msg}`; depois classifica + sanitiza, e o lote continua com `Promise.allSettled` (uma conta não derruba as outras). Se o próprio UPDATE de estado falhar, loga e segue — antes o erro do update também não era propagado.
- `gmail-sync` sync-inbox catch: antes `error` + mensagem crua e `throw`; depois helper, `throw` mantido (a resposta 500 vem do catch externo, agora com `sanitizeGmailErrorMessage`).

## O que NÃO fiz e por quê
- Não usei o literal `ok` no sucesso: o estado saudável já usado no módulo é `synced` (front e testes CAS leem esse valor). Criar um segundo estado saudável quebraria consumidores; o "ok" do cartão == `synced` de hoje.
- Não toquei no front (`GmailIntegrationCard.tsx` / `useGmail.ts`): fora da minha área. Deixo comentário no cartão para a tela mostrar "reconectar" quando `sync_status='reauth_required'`.
- Não regenerei `deployment-manifest.json` (é do integrador).
