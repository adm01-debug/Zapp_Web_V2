Especialista: hugo

## O que mudou e por quê
- `src/services/outbound-message.service.ts`: quando o `enqueue_*` devolve uma linha que já terminou em
  falha DEFINITIVA (`status='failed'`), o reenvio da MESMA ação passa a ser feito com um `client_message_id`
  NOVO (helper `enqueueOrResendAfterDefinitiveFailure`), em vez de reenfileirar o id antigo. A linha
  `failed` continua no histórico e a chave da ação (`pendingActionIds`) passa a apontar para o id novo.
  Vale para o envio simples (`enqueue_outbound_message`) e para o estruturado (`enqueue_rich_outbound_message`).
- `src/services/__tests__/outbound-message.service.test.ts`: 3 testes novos cobrindo o reenvio após falha
  definitiva (chat, idempotência da resposta perdida do reenvio e caminho estruturado).
- `clearPendingAction` deixou de exigir o id: depois do reenvio, o id corrente da chave não é mais o da
  chamada original, e era exatamente por isso que a limpeza não acontecia.

Motivo: o `claim` do `message-delivery` só aceita `status='sending'`; a linha `failed` é imutável para
aquele id, o gateway responde 409 (`Message delivery is already in progress or cannot be sent`) e o botão
"Enviar de novo" do `SendErrorBanner` nunca saía — o `actionKey` do reenvio é idêntico ao do envio
original (mesmo contato, mesmo tipo, mesmo texto), então o id em memória era reaproveitado.

## PRIMEIRO VERMELHO
Serviço no estado do HEAD (sem o fix), com os 3 testes novos já no arquivo:
`npx vitest run src/services/__tests__/outbound-message.service.test.ts`
```
⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯
 FAIL  ... > sendOutboundMessage > reenvio depois de falha DEFINITIVA vira mensagem nova, com id novo (chat)
AssertionError: promise rejected "Error: Message delivery is already in pro…" instead of resolving
 FAIL  ... > resposta perdida do reenvio continua idempotente: a chave da ação passa para o id novo
AssertionError: expected [ 'id-reenvio-1', 'id-reenvio-1' ] to have a length of 3 but got 2
 FAIL  ... > mensagem estruturada também reenvia com id novo depois de falha definitiva
AssertionError: expected { …(4) } to match object { …(2) }
      Tests  3 failed | 12 passed (15)
```
O primeiro erro é o sintoma de produção: 409 "already in progress".

## DEPOIS VERDE
`npx vitest run src/services/__tests__/outbound-message.service.test.ts`
```
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## CONTENÇÃO DE REGRESSÃO (vizinhos que usam o serviço)
`npx vitest run src/hooks/realtime/__tests__ src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts`
```
 Test Files  5 passed (5)
      Tests  42 passed (42)
```
A idempotência do caso ambíguo (resposta perdida com `status='sending'`) segue intacta: o teste
`reuses the same browser action id after an ambiguous dispatch failure` continua passando sem alteração —
nenhum teste existente foi removido/afrouxado (o diff de teste só acrescenta).

## Prova
- `git diff --stat` (números no bloco FATOS MEDIDOS PELO FECHAR).
- vermelho antes: `npx vitest run src/services/__tests__/outbound-message.service.test.ts` → `Tests 3 failed | 12 passed (15)`
- verde depois: mesmo comando → `Tests 15 passed (15)`

## CONTRATO DE FRONTEIRA
- Não toquei em RPC, migration, RLS nem Edge Function: o contrato do banco (`enqueue_*` devolve a linha
  existente; `claim` só aceita `sending`) foi lido em `supabase/migrations/20260909220000_...sql` e
  `20260930200000_enforce_enqueue_connection_scope.sql`, e é o que o teste reproduz.
- Nada de export/import/edição em massa; nenhum dado real, nenhuma URL de produção, nenhum push/deploy.

## DÚVIDA / LIMITE
Adjacente e fora do escopo (registrado em comentário no cartão, não corrigido): a drenagem da fila offline
(`deliverQueuedOfflineMessage`) usa o `clientMessageId` como identidade da fila local
(`offlineQueue.remove(clientMessageId)`), então não pode rotacionar o id; se aquela linha já terminou em
`failed` no servidor, a drenagem bate em 409 em toda reconexão. Precisa de decisão de contrato em cartão
próprio.
