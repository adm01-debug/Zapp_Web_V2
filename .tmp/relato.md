Especialista: Edgar (area-edge-api)

## FATOS MEDIDOS PELO FECHAR
- `zapp-verify . --rapido`: VERDE (dependencias 2s, db_guard 0s, tipos 94s, lint 0s, migrations 0s)
- `git diff --stat`: sem diff (workspace limpo, base do dia)
- `git grep -n 'recipient_id' supabase/functions/talkx-link/ supabase/functions/talkx-send/`: 47 ocorrências listadas abaixo

## O que mudou e por quê
Nenhuma mudança de código neste workspace. O cartão é de verificação pós-feat(talkx): confirmar que `zapp-verify` passa, que o diff está limpo e que todos os caminhos com `recipient_id` (o padrão antigo substituído por token HMAC) estão identificados.

## Prova
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (96s)`
- `git diff --stat` → (vazio, sem diff)
- `git grep -n 'recipient_id'` → 47 caminhos listados no relato

## Caminhos com `recipient_id` (mesmo defeito do padrão antigo)

### In-scope (código de produção que ainda usa recipient_id bruto em URLs ou queries):
- `supabase/functions/talkx-link/index.ts:4` — GET `/talkx-link?s=<slug>&r=<recipient_id>` aceita recipient_id bruto no parâmetro r
- `supabase/functions/talkx-link/index.ts:174-176` — extrai `recipient_id` do body da request
- `supabase/functions/talkx-link/index.ts:190-191` — valida que `recipient_id` está presente (400 se ausente)
- `supabase/functions/talkx-link/index.ts:226` — usa `recipient_id` para lookup no banco
- `supabase/functions/talkx-link/index.ts:242` — registra `p_recipient_id` no log de clique
- `supabase/functions/talkx-send/index.ts:300` — usa `recipientId` como `p_recipient_id` no claim
- `supabase/functions/talkx-send/index.ts:610` — tipagem `recipient_id: string`
- `supabase/functions/talkx-send/index.ts:702` — usa `recipient_id` no log de entrega
- `supabase/functions/talkx-send/index.ts:797-802` — log com `recipient_id` do destinatário
- `supabase/functions/talkx-send/process-recipient.ts:268,289,302,312,412,428,437,532,546,558,621,631,655,673,675,696` — usa `recipient_id` em queries e logs de processamento

### Out-of-scope (não tocar neste cartão — são testes/utilitários):
- `supabase/functions/talkx-link/index.test.ts` — dados de teste com `recipient_id`
- `supabase/functions/talkx-send/index.test.ts` — dados de teste com `recipient_id`
- `supabase/functions/talkx-send/_test-utils.ts` — utilitário de teste com `recipient_id`
- `supabase/functions/talkx-send/engine.integration.test.ts` — teste de integração com `p_recipient_id`
- `supabase/functions/talkx-send/r3-delta-011-excecao-nao-perde-log.test.ts` — teste com `recipient_id`
- `supabase/functions/talkx-send/r3-delta-012-quarentena-attempt-no-log.test.ts` — teste com `recipient_id`
- `supabase/functions/talkx-send/t-afa5df1d-excecao-nao-perde-evento-agregado.test.ts` — teste com `recipient_id`
- `supabase/functions/talkx-send/x033-delivery-log.test.ts` — teste com `recipient_id`

## O que NÃO fiz e por quê
- Não implementei a troca de `recipient_id` por token HMAC: o cartão de verificação não pede implementação, apenas listagem dos caminhos.
- Não mexi em banco de produção: nenhuma referência a banco real no relato.