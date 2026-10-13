Especialista: hugo

## O que mudou e por quê
- src/hooks/gmail/gmailTypes.ts: o tipo `GmailAccount.sync_status` não conhecia `reauth_required`, o estado que o backend grava quando o Google recusa o refresh token (cartão pai t_10bdc717). Extraí `GmailSyncStatus` (`pending|syncing|synced|error|reauth_required`) e usei no campo — mudança ADITIVA: nenhum valor antigo saiu.
- src/hooks/integrations/useGmail.ts: o hook passa a expor, da conta ATIVA, `syncStatus`, `lastError`, `lastSyncedAt` e o derivado `needsReconnect` (`syncStatus === 'reauth_required'`). `lastError` é o texto que o backend já sanitiza (sem token nem e-mail completo — supabase/functions/_shared/gmail-helpers.ts); o hook só normaliza para string não vazia ou `null`, sem inventar texto próprio. Só acrescentei campos ao retorno (nenhum contrato existente mudou) e conferi os chamadores: GmailIntegrationCard e GmailWebhookMonitor leem `activeAccount.sync_status` como string — seguem compilando.
- src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx (novo): 5 casos com o hook REAL contra o payload de `gmail-oauth list-accounts`.

## Atualização ao vivo (já existia; o teste fixa o contrato)
A invalidação de `['gmail-accounts']` já acontecia em `syncInbox` (onSuccess) e em `exchangeCode` (o retorno do OAuth = reconectar). Não escrevi código novo para isso; os dois últimos testes provam esse contrato e passam também na base (por isso não contam como prova vermelho→verde).

## Dependência (cartão pai)
A faixa do pai não estava no workspace (`git merge-base --is-ancestor a9019042a HEAD` = falso). Segui a instrução do cartão e trouxe a faixa inteira de `~/hermes-workspaces/.v2-fila/26101223120ba8.json` (base `dia/2026-10-12`, sha `a9019042a`, 1 commit) via `git cherry-pick` → commit 8351952b2. O meu trabalho de front é o commit ddd65c60a.
Os 6 arquivos que esse cherry-pick traz (área Edge, código do pai, NÃO escritos por mim): supabase/functions/_shared/gmail-helpers.ts, supabase/functions/gmail-cron-sync/index.ts, supabase/functions/gmail-sync/index.ts, supabase/functions/gmail-oauth/index.ts, supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts, supabase/functions/gmail-oauth/index.test.ts.

## Prova
- vermelho antes (código de produção revertido a HEAD, só o teste novo): `npx vitest run src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx` → `Test Files 1 failed (1)` / `Tests 3 failed | 2 passed (5)` (os 3 de campo novo falham; os 2 de invalidação já passavam).
- verde depois: mesmo comando → `Test Files 1 passed (1)` / `Tests 5 passed (5)`.
- regressão (os 4 testes existentes do useGmail + o novo): `npx vitest run .../useGmail.test.ts .../useGmail.syncParcial.test.tsx .../useGmail.threadListQuery.test.tsx .../useGmail.historicoPaginacao.test.tsx .../useGmail.syncStatus.test.tsx` → `Test Files 5 passed (5)` / `Tests 33 passed (33)`.

## O que NÃO fiz e por quê
- Não toquei no rótulo pt-BR de "reconectar" na tela (`GmailIntegrationCard.tsx`): é da worker (telas). O hook já entrega `needsReconnect` para ela usar.
- Não mexi no estado da conta fora do módulo do Gmail (ninguém mais pede) e não criei canal de realtime novo: o cartão pede "invalida após sincronizar/reconectar", que já está feito.
