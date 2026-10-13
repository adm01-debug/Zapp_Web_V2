Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `supabase/functions/message-delivery/index.test.ts`: 6 testes NOVOS e as asserções de contrato pedidas pelo cartão — as ramificações que a lista do cartão apontava como descobertas.
  - 404 do claim vazio com a LINHA PRESENTE e negada: mensagem de OUTRO agente (`agent_id` ≠ profile) e mensagem de ENTRADA (`sender` ≠ `agent`), mais a linha inexistente. Cada um prova que o objeto protegido EXISTE e é negado, e que o 404 não se confunde com o 409 de `in_progress` (assert do `code` ausente x `code='in_progress'`).
  - `mark_first_response` falhando por ERRO retornado e por EXCEÇÃO: envio já confirmado segue `200`, com `externalId`, sem `code`, sem `fail_outbound_message` e sem reconciliação.
  - recusa 4xx genérica do provedor: `provider_rejected`, sem reconciliação (4xx não reconcilia).
- `assertFailClaim(client)` passa a ser chamado em CADA teste que dispara `fail_outbound_message`, afirmando `p_retryable=false` + motivo (`p_message_id`, `p_claim_token`).
- `assertReconcileEnqueued(client, externalId)` afirma o motivo do enfileiramento: `p_kind`, a chave estável `reconcile:message.send:<message_id>`, `effect`, `source_table`, `source_id` e o `external_id` (null quando o POST saiu sem id; o id do provedor quando o recibo falhou).
- Helper do fake ampliado (`rpcErrors`, `rpcThrows`) e `rpcArgs` — nada disso muda o caminho de produção.

## Prova (por mutação — revertei SÓ a produção)
- verde depois: `deno test --allow-env supabase/functions/message-delivery/index.test.ts` → `ok | 28 passed | 0 failed`
- M1 ACL do 404 removida (`existing.agent_id !== profile.id || existing.sender !== 'agent'` retirado): `FAILED | 26 passed | 2 failed` — `outro agente` e `ENTRADA` falham (recebiam 409 em vez de 404).
- M2 `p_retryable: false` → `true` em `failClaim`: `FAILED | ...` — 8 testes falham com `Error: fail p_retryable: expected false, got true`.
- M3 `external_id` da reconciliação `null` → `'wamid.wrong'`: `Error: reconcile payload.external_id: expected null, got "wamid.wrong"`.
- M4 try/catch best-effort do `mark_first_response` removido: `FAILED | 26 passed | 2 failed` — os dois testes de métrica falham.
- Produção restaurada byte a byte: `git diff b21adb04a6 -- supabase/functions/message-delivery/index.ts` vazio; `grep -rn MUTACAO supabase/functions/` → nenhuma.

## O que NÃO fiz e por quê
- Não toquei em `index.ts` (só o teste é meu escopo); os apontamentos do revisor que pedem MUDANÇA de produção (ex.: `instance_unavailable` x `provider_unavailable` na classificação, prova de unicidade do id de replay no banco) são do cartão de produção — este cartão manda não alterar produção. O ponto de injeção (`deps`: service client, evoFetch, reconciliação) já existia e foi reaproveitado, sem inventar nada.
- A faixa do cartão pai (t_996e42f2) não estava no meu workspace: trouxe por `git cherry-pick` (a branch do dia aqui não é a mesma da fila), como manda o protocolo.
