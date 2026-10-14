Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- supabase/functions/_shared/gmail-helpers.ts: nova `persistGmailMessageLabels(supabase, accountId, gmailMessageId, labelIds, localThreadId)` — grava `label_ids/is_read/is_starred` da mensagem a partir dos `labelIds` que o Gmail devolve e recalcula `label_ids/is_unread/is_starred/status` da thread dona (mesmos campos que `modify-thread-labels` mantém). Devolve `false` em falha local.
- supabase/functions/gmail-send/index.ts: o `case "trash"` lia só `id` da mensagem e, depois do 200 do Gmail, devolvia `{success:true}` sem tocar o banco. Agora lê `id, thread_id`, parseia o corpo do `messages/{id}/trash` (`labelIds`) e chama a helper; se a escrita local falhar (ou vierem `labelIds` inválidos) responde `{success:true, warning:"local_persistence_failed"}` — o descarte no Gmail não é desfeito, e nada de erro interno volta ao cliente.
- supabase/functions/gmail-send/trash-persistencia.test.ts: novo, 5 casos com `SupabaseClient` fake (padrão de `_shared/__tests__/gmail-helpers-account-scope.test.ts`): mensagem+thread recalculadas; `UNREAD` mantém `is_read=false`; outra mensagem na INBOX mantém `status='open'` (borda); `localThreadId` nulo atualiza só a mensagem; erro na mensagem/leitura/thread devolve `false` sem lançar. Cada assert confere o payload e os filtros `eq` (`gmail_message_id`+`gmail_account_id`, `id`+`gmail_account_id`) — prova o escopo por conta.

## Prova
- vermelho antes: `git stash push -m red-proof -- supabase/functions/_shared/gmail-helpers.ts supabase/functions/gmail-send/index.ts && deno test --config scripts/ci/deno.json --allow-env supabase/functions/gmail-send/trash-persistencia.test.ts` → `import { persistGmailMessageLabels } from "../_shared/gmail-helpers.ts";` / `error: Type checking failed.` (a helper não existia; o `case "trash"` antigo não tinha nenhuma escrita local — bastam os 11 linhas do diff em index.ts).
- verde depois: `deno test --config scripts/ci/deno.json --allow-env supabase/functions/gmail-send/trash-persistencia.test.ts` → `ok | 5 passed | 0 failed (14ms)`.
- commit: fed8633fd9 fix(gmail-send): persiste localmente a mensagem descartada (acao trash).

## O que NÃO fiz e por quê
- Não toquei `trash-thread`: já persistia (`status='archived'`, `label_ids=['TRASH']`) antes deste cartão; o cartão é da ação `trash` de mensagem.
- Não rodei a suíte inteira de Edge; só o teste do cartão, como pede o fluxo.
