Especialista: edgar
Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- supabase/functions/_shared/gmail-helpers.ts: vira a cópia ÚNICA do refresh (`requestGmailTokenRefresh`) usada por gmail-cron-sync/gmail-sync/gmail-send/gmail-webhook e pelo seam do gmail-oauth — antes eram 4 POSTs duplicados em oauth2.googleapis.com/token e dois edges engoliam o corpo da recusa ("Failed to refresh token"). A recusa mantém o corpo (invalid_grant) para classificar. Acrescenta `GMAIL_REAUTH_CODE`/`GMAIL_REAUTH_HTTP_STATUS`=409, `gmailReauthErrorPayload()`, a espera crescente (`gmailBackoffMs`, `selectGmailAccountsDue`) e grava `error_count`/`next_attempt_at` em `recordGmailAccountFailure` (só no ramo 'error').
- supabase/functions/gmail-send/index.ts: remove as cópias locais de getTokens/storeTokens/ensureValidToken; token revogado no envio vira 409 `reauth_required` e marca a conta; o `catch` de topo também devolve 409 quando o erro é de reauth. Handler exportado (`handleGmailSend`) + `if (import.meta.main)` para poder testar a rota real (mesmo padrão de gmail-webhook/gmail-cron-sync).
- supabase/functions/gmail-webhook/index.ts: remove a cópia local de refresh (`getTokens`/`storeTokens`/`refreshToken`); token revogado marca a conta, para o sync e devolve 200 `{acknowledged:true,reauth_required:true}` (ACK do Pub/Sub).
- supabase/functions/gmail-cron-sync/index.ts: lê `sync_status,error_count,next_attempt_at`, pula `reauth_required` e contas na espera, conta a espera a partir das falhas seguidas; sync bem-sucedido zera error_count/next_attempt_at (também em `runGmailFullSync`).
- supabase/functions/gmail-oauth/index.ts: refresh-token recusado marca a conta e devolve 409; reconectar zera error_count/next_attempt_at no upsert.
- supabase/migrations/20261014023912_gmail_accounts_sync_backoff.sql: ADITIVA — error_count integer NOT NULL DEFAULT 0 e next_attempt_at timestamptz; `SET search_path = public, pg_temp`; `-- Rollback (SQL executavel, na ordem):` com `alter table ... drop column if exists ...`; sem GRANT nem RLS novos (a ACL da tabela ja cobre as colunas).
  - Ajuste apos o juiz barato ("ANTES DE ENTREGAR"): o rollback passou do formato de uma linha para o SQL executavel comentado, no modelo de ai_jobs_efeito_externo_lease.

## Prova
- novos testes: `deno test --config scripts/ci/deno.json --allow-env supabase/functions/gmail-cron-sync/reauth-e-backoff.test.ts supabase/functions/gmail-send/reauth-409.test.ts` -> `ok | 3 passed | 0 failed`
- vermelho ANTES (mutação desfeita depois): mesma suíte com o ramo de reauth removido e sem registrar a espera -> `FAILED | 0 passed | 3 failed`
- regressão dos testes Gmail existentes: `deno test --config scripts/ci/deno.json --allow-env --allow-net=127.0.0.1 supabase/functions/gmail-webhook/history-404-cas.test.ts supabase/functions/gmail-webhook/attachments.test.ts supabase/functions/gmail-oauth/index.test.ts supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts` -> `ok | 26 passed | 0 failed`
- migration aplicada no banco local da tarefa: `hermes-db-migrar supabase/migrations/20261014023912_gmail_accounts_sync_backoff.sql` -> `APLICADA no banco LOCAL 'v2-2610132319a7cf' (produção não foi tocada)`
- auditoria de banco: `bash scripts/db-audit/gmail-accounts-sync-backoff.test.sh` -> `[OK] espera crescente do gmail_accounts verificada (aditiva, sem ampliar privilegio)`; vacidade `ZAPP_GMAIL_BACKOFF_SEM_MIGRACAO=1` -> o BLOCO B falha, provando que as asserções não são vazias. Registrado no CI: passo em `.github/workflows/db-guard.yml`; `node scripts/ci/check-test-inventory.mjs` não aponta mais este teste como órfão (os 6 órfãos que restam são de outros cartões, pré-existentes).
- verificação: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (28s)`

## Contrato com quem chama
- gmail-send passa a devolver HTTP 409 `{error, code:'reauth_required'}` onde antes virava 500 genérico de envio; o app converte em kind:'reauth' e abre a reconexão.
- gmail-webhook segue 200 (ACK do Pub/Sub) mesmo com token revogado, marcando a conta.
- gmail-oauth (refresh-token) devolve 409 no mesmo caso.
- gmail-cron-sync: a resposta ganha `skipped` (contas não tentadas por reauth/espera).

## Sensibilidade
- toca classificação de erro de token e o status HTTP do envio, mas NADA foi afrouxado: nenhum grant novo (o teste prova que o ACL da tabela é idêntico antes/depois), nenhum log/resposta com token, e `get_gmail_tokens`/`store_gmail_tokens` seguem só via service_role.
- a prova usa conta sintética (`conta@exemplo.test`) e chave de teste; nada de produção, nenhum e-mail/token real no teste nem no relato.

## O que NÃO fiz e por quê
- Não fiz push/deploy nem toquei produção (só o Joaquim autoriza).
- `zapp-verify . v2-2610132319a7cf --rapido` acusa drift de `banco_local` pré-existente (ai_usage_outbox, ai_jobs, conversation_tasks, warroom_alerts, conversation_closures e as colunas novas do gmail do próprio cartão): são migrations do dia ainda não aplicadas em produção, não deste cartão — por isso a prova de banco é o teste de auditoria acima, e a verificação prescrita (`zapp-verify . --rapido`) fica VERDE.

## Escopo: por que estes arquivos entraram (e um deles não é meu)
- `scripts/db-audit/gmail-accounts-sync-backoff.test.sh` e `.github/workflows/db-guard.yml`: são a PROVA de banco que o cartão exige (o teste roda no CI, que reprova `.test.sh` novo sem passo no YAML — o próprio juiz barato mandou registrar). Sem eles não há prova de banco nem CI.
- `supabase/migrations/20261014023912_gmail_accounts_sync_backoff.sql`: é a única forma de existir a espera crescente (`error_count`/`next_attempt_at`) que o `gmail-cron-sync` usa; aditiva, com rollback executável.
- `supabase/functions/gmail-sync/index.ts`, `supabase/functions/gmail-oauth/index.test.ts`, `supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts` e `supabase/functions/gmail-send/trash-persistencia.test.ts` NÃO foram editados por mim: as mudanças vêm dos cartões-pai (PE-06 e o cartão de trash) já na base da branch. O meu commit `cd33ed8cb7` não toca `gmail-sync/index.ts` — confira em `git show --stat HEAD`.
