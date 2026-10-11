Especialista: Edgar (area-edge-api)

## Sensibilidade
- Diff só em `supabase/functions/**` + a entrada documentada em `supabase/config.toml`.
- Toca o gate administrativo (`is_admin_or_supervisor`), o client `service_role` (insert em `audit_logs`) e o webhook público. Nenhuma proteção afrouxada: o evento reservado `selftest` só é ACKado DEPOIS do gate de autenticidade (HMAC ou instanceToken) que já existia — a prova é o caso NEGADO (sem assinatura → 401).
- O segredo nunca sai: o autoteste só o usa para ASSINAR uma sonda; nenhuma resposta, log ou linha de auditoria carrega o valor (provado por assert que varre o JSON da auditoria).
- Nenhuma referência ao banco/endpoint de produção; só env var por nome.
- O que muda para quem chama o webhook: nada. `selftest` é um `event` novo e reservado, que nenhum emissor real manda.

## O que mudou e por quê
- `supabase/functions/webhook-hmac-selftest/index.ts` (NOVO): Edge de autoteste, só admin/supervisor. Monta um evento reservado (`event: 'selftest'`, sem dado de cliente), dispara duas sondas contra o próprio `evolution-webhook` — uma assinada com o segredo atual (HMAC) e uma sem assinatura — e reporta `{ assinado_aceito, sem_assinatura_recusado, modo_estrito, enforce_mode, latencia, configurado }`. Grava o resultado em `audit_logs` (`action: 'webhook_hmac_selftest'`) sem o segredo. Sem segredo configurado, reporta `configurado:false` e `assinado_aceito:false` em vez de fingir sucesso. `dispatch` e clients são injetáveis (teste usa o handler real do webhook, sem rede).
- `supabase/functions/evolution-webhook/index.ts`: ramo NOVO de 12 linhas que reconhece `event === 'selftest'` e responde `200 {success:true,selftest:true}` — posicionado DEPOIS do gate de autenticidade e ANTES de qualquer handler/escrita. Nenhum ramo existente mudou (verificado: nenhum `failedCount`/RPC movido; só um `if` novo com `return`).
- `supabase/config.toml`: entrada `[functions.webhook-hmac-selftest]` com `verify_jwt = true` (o default do CLI), documentada — ferramenta administrativa não entra na lista de `verify_jwt=false`.
- `supabase/functions/webhook-hmac-selftest/index.test.ts` (NOVO): 5 testes.

## Prova
- vermelho antes (só com a Edge nova, SEM o ramo `selftest` do webhook — `evolution-webhook/index.ts` revertido no stash, restaurado depois):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/webhook-hmac-selftest/index.test.ts`
  → `FAILED | 4 passed | 1 failed` — `AssertionError: a resposta precisa marcar o evento reservado selftest`
- verde depois:
  `deno test ... supabase/functions/webhook-hmac-selftest/index.test.ts supabase/functions/_shared/__tests__/webhook-auth-gates.test.ts`
  → `ok | 26 passed | 0 failed`  (5 novos + 21 do gate de webhooks, para provar que o ramo novo não quebrou o gate)
- `node scripts/edge-deploy/generate-manifest.mjs --check` na base antes: `Deployment manifest is stale`.

## Escopo e contagens (batem com o diff)
- Arquivos no diff: 5 (`supabase/config.toml`, `supabase/functions/evolution-webhook/index.ts`, `supabase/functions/webhook-hmac-selftest/index.ts`, `supabase/functions/webhook-hmac-selftest/index.test.ts` e o próprio `.tmp/relato.md`).
- Arquivos de teste: 1 (`supabase/functions/webhook-hmac-selftest/index.test.ts`); casos de teste novos: 5.

## O que NÃO fiz e por quê
- NÃO regenerei `supabase/deployment-manifest.json`: é gerado, e o integrador o regenera (regra da minha área). Consequência esperada e honesta: `generate-manifest.mjs --check` acusa stale enquanto a nova Edge + a entrada de config não entrarem no manifesto; o `zapp-verify --rapido` do fechar não roda esse check.
- NÃO criei tela/botão: o cartão pede a Edge e o reconhecimento no webhook.
