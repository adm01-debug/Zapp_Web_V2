Especialista: senior (area-edge-api)

## Ponto 1 — fora de escopo fora do diff + proveniência
- `send-scheduled-report/index.ts` e `index.test.ts`: a entrega anterior (49daab6436) tinha REVERTIDO o `tallyFirstResponse` do cartão pai. Restaurei os dois arquivos ao estado do pai (`git checkout 75d97916fe -- ...`). Prova: `git diff dia/2026-10-14 -- supabase/functions/send-scheduled-report/` vazio — zero diff contra o dia.
- Remoção do bloco `mark_first_response`: não é deste cartão. Veio de c09b984a4e (`git show c09b984a4e -- index.ts`: remove a chamada best-effort e deixa o comentário do trigger). Na base dia/2026-10-13 (338a420d1e) já não há chamada viva — só o comentário (linha 471).
- `deliverOutbound` + `resolveInstanceToken` + 3 testes TRA-002: vieram de 75d97916fe (`git log -S "export async function deliverOutbound"` → só 75d97916fe). `deliverOutbound` já existe na base 338a420d1e (linha 271). Meu commit não toca nessas linhas.
- Teste `does not call the redundant mark_first_response RPC` (R2-SLA): introduzido por c09b984a4e (`git log -S` → só c09b984a4e). Mantido, sem alteração.
- Teste que prova: os 4 testes herdados (R2-SLA + 3 TRA-002) passam no verde abaixo sem eu tê-los tocado; o restore do send-scheduled-report é provado pelo diff vazio contra o dia.

## Ponto 2 — handler coberto com handleMessageDeliveryRequest (service falso)
- Costura mínima em `message-delivery/index.ts`: `handleMessageDeliveryRequest(req, deps?)` com `deps.auth` (repassado a `requireAuth`), `deps.checkRate` (padrão: `enforceRateLimit`), `deps.service` (padrão: `createClient` service_role) e `deps.deliverPost` (padrão: `deliverOutbound` da conexão do claim). Sem `deps`, o caminho de produção é byte-identico ao anterior. Único chamador além dos testes é `Deno.serve((req) => handleMessageDeliveryRequest(req))` (mesmo padrão de `create-user`, que também tem `deps`).
- 5 testes novos em `index.test.ts`, todos via `handleMessageDeliveryRequest` com service falso (rpc/from gravados) + `deliverPost` espião:
  1. `PD-79 handler: marca recusada => 409 e NENHUM POST sai` — mark P0002 → 409 "nothing was sent", 0 POSTs, ordem claim > mark, sem `fail_outbound_message`.
  2. `PD-79 handler: caminho feliz carimba ANTES do POST e devolve 200` — ordem mark < POST < complete, `externalId` wa-123.
  3. `PD-79 handler: abort OU erro de rede => 502 + fail_outbound_message p_retryable=false` — 2 cenários (AbortError + connection reset), reconciliação enfileirada.
  4. `PD-78 handler: claim vazio devolve 409 com o reason` — `reason` + `error` com `sem_conexao_conectada`, 0 POSTs.
  5. `PD-78 handler: claim vazio com lease VIVO => 409 in progress` — 42501 → 409 sem `fail_outbound_message` nem reconcile.
- Vermelho antes: com a guarda da marca neutra (`if (false)` no lugar de `if (!mark.marked)`), o teste 1 FALHA (`FAILED | 0 passed | 1 failed | 23 filtered out`). Com a guarda restaurada, verde.
- Verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/message-delivery/index.test.ts` → `ok | 24 passed | 0 failed`.

## Ponto 3 — contagens e "TI M"
- Contagem correta de casos novos na entrega toda: 16 = 1 R2-SLA (c09b984a4e) + 3 TRA-002 (75d97916fe) + 5 PD-79 + 2 PD-78 (49daab6436) + 5 de handler (este refazer). O "10" do relato anterior estava errado.
- Typo `TI M` removido (comentário PD-79 em `index.ts`, linha 26: agora "o POST ao provedor tem de terminar antes do lease"). Prova: `grep -n "TI M" supabase/functions/message-delivery/index.ts` vazio.

## Ponto 4 — Arquivos (lista exata, `git diff --name-only 49daab6436...HEAD`)
- `supabase/functions/message-delivery/index.ts` (costura `deps` + typo + serve wrapper)
- `supabase/functions/message-delivery/index.test.ts` (5 testes de handler)
- `supabase/functions/send-scheduled-report/index.ts` (restore ao estado do pai — desfaz o revert indevido)
- `supabase/functions/send-scheduled-report/index.test.ts` (idem)
- `.tmp/relato.md` (este arquivo)
- Patch do commit: 35.805 caracteres (limite 90.000). Sem migration, sem manifesto, sem outra área.

## Verificação
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/message-delivery/index.test.ts` → `ok | 24 passed | 0 failed` (36–45 ms; sem rede real — service/auth/rate/POST todos falsos).
- Sem chamadores externos para regressão: `grep handleMessageDeliveryRequest` fora de `message-delivery/index.*` retorna vazio (só `Deno.serve` + testes).
- `zapp-verify --rapido`: ver FATOS MEDIDOS no fechamento.
