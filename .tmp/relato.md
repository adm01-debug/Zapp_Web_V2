Especialista: edgar
Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca `service_role` (inserção em `audit_logs` pela função, como já fazem `create-user`, `approve-password-reset` e `elevenlabs-voice-design`) e o portão de account takeover do `gmail-oauth`.
- NENHUMA proteção afrouxada: a linha ATIVA de outro dono continua recusada com 409 e nada é gravado — provado pelo teste novo "linha ATIVA de outro usuário continua recusada (409) e nada é gravado" (`upsertCalls.length === 0`, `auditCalls.length === 0`).
- Nenhuma referência ao banco/endpoint de produção (testes com admin falso; nenhuma credencial).
- O que muda para quem chama: antes, reconectar um e-mail já ligado a OUTRO dono dava 409 sempre; agora dá 409 só quando a linha está `is_active = true`. Se a linha está `is_active = false` (conexão desfeita / dono saiu), a reconexão assume a linha e grava trilha. O `409` do caso ativo não mudou de forma nem de status.

## O que mudou e por quê
- `supabase/functions/gmail-oauth/index.ts`
  - `exchange-code`, guarda de takeover: o `select` passou a trazer `id, user_id, is_active`; a recusa 409 agora só vale para linha ATIVA de outro dono. Linha INATIVA de outro dono é assumida — o `upsert` já traz `user_id`, então a posse passa para quem reconectou (o dono já não tinha a conta ligada). A assunção grava `audit_logs` (action `gmail_account_taken_over`, entity `gmail_account`, `details.previous_user_id` e `details.email_masked`) ANTES do upsert e com fail-closed: se a trilha não gravar, responde 500 e o vínculo NÃO é assumido (teste "falha ao gravar a trilha NÃO assume a linha").
  - O e-mail completo nunca entra em log/`details`: só a máscara (`u***@gmail.com`) via `maskEmail`, provado por assert sobre o JSON da trilha.
  - `upsert` da reconexão: acrescentado `history_id: null` — `sync_status: "pending"` refaz o sync do zero e um historyId velho só renderizaria 404 de histórico e gastaria um ciclo. (`last_error: null`, `error_count: 0`, `next_attempt_at: null` já vinham do commit do pai; o teste agora os cobre.)
- `supabase/functions/gmail-oauth/index.test.ts`: o fake passou a devolver `id`/`is_active` no `maybeSingle` e a capturar inserts em `audit_logs`; o teste de reconexão ganhou as asserts de `history_id`/`error_count`/`next_attempt_at` e entraram 3 testes novos (409 com nada gravado; assunção de linha inativa com trilha mascarada; falha da trilha = fail-closed).

Ramos de erro: o único ramo de erro novo é o da trilha de auditoria (fail-closed, 500 sem upsert e sem `store_gmail_tokens`). O 409 do caso ativo é o mesmo `errorResponse` de antes, apenas dentro do `if (is_active)`. Nenhum ramo de erro existente foi alterado.

## FAIXA DO PAI
FAIXA DO PAI: commits 3e5db2f42d (fix(edge): refresh do Gmail recusado vira reauth_required), 3a381fd020 (fix(gmail-send): persiste localmente a mensagem descartada) e d3b10c95e0 (fix(gmail): token revogado vira 409 reauth_required; orig. 06bf4b33a do cartão t_d7ef14d6) — não são deste cartão. Arquivos que só existem no diff por causa dessa faixa: `.github/workflows/db-guard.yml`, `scripts/db-audit/gmail-accounts-sync-backoff.test.sh`, `supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts`, `supabase/functions/_shared/gmail-helpers.ts`, `supabase/functions/gmail-cron-sync/index.ts`, `supabase/functions/gmail-cron-sync/reauth-e-backoff.test.ts`, `supabase/functions/gmail-send/index.ts`, `supabase/functions/gmail-send/reauth-409.test.ts`, `supabase/functions/gmail-send/trash-persistencia.test.ts`, `supabase/functions/gmail-sync/index.ts`, `supabase/functions/gmail-webhook/index.ts`, `supabase/migrations/20261014023912_gmail_accounts_sync_backoff.sql`. Deste cartão são só `supabase/functions/gmail-oauth/index.ts` e `supabase/functions/gmail-oauth/index.test.ts`.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json supabase/functions/gmail-oauth/index.test.ts` → `FAILED | 18 passed | 3 failed` (history_id não zerado e linha inativa devolvendo 409 em vez de 200).
- verde depois: mesmo comando → `ok | 21 passed | 0 failed (42ms)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (165s)` (tipos, lint, migrations, db_guard, dependencias OK; banco não verificado — o cartão pediu `--rapido`).
