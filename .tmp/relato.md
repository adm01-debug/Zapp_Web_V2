Especialista: hugo

## O que mudou e por quê
- `src/services/outbound-message.service.ts`: quando o `enqueue_*` devolve uma linha que já terminou em
  falha DEFINITIVA (`status='failed'`), o reenvio da MESMA ação passa a usar um `client_message_id` NOVO
  (helper `enqueueOrResendAfterDefinitiveFailure`) em vez de reenfileirar o id antigo. A linha `failed`
  continua no histórico e a chave da ação (`pendingActionIds`) passa a apontar para o id novo. Vale para o
  envio simples (`enqueue_outbound_message`) e para o estruturado (`enqueue_rich_outbound_message`).
- `src/services/__tests__/outbound-message.service.test.ts`: 3 testes novos provam o reenvio após falha
  definitiva no caminho do chat, a idempotência da resposta perdida do reenvio e o caminho estruturado.
- `clearPendingAction` deixou de exigir o id: quem decide é a chave da ação, que é trocada pelo id novo.

Motivo: o `claim` do `message-delivery` só aceita `status='sending'`, então a linha `failed` é imutável
para aquele id, o gateway responde 409 (`Message delivery is already in progress or cannot be sent`) e o
botão "Enviar de novo" do `SendErrorBanner` nunca saía — o `actionKey` do reenvio é idêntico ao do envio
original (mesmo contato, mesmo tipo, mesmo texto), logo o id em memória era reaproveitado.

## PRIMEIRO VERMELHO
Serviço no estado do HEAD (sem o fix), com os 3 testes novos já no arquivo:
`npx vitest run src/services/__tests__/outbound-message.service.test.ts`
```
⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯
 FAIL  ... > reenvio depois de falha DEFINITIVA vira mensagem nova, com id novo (chat)
AssertionError: promise rejected "Error: Message delivery is already in pro…" instead of resolving
 FAIL  ... > resposta perdida do reenvio continua idempotente: a chave da ação passa para o id novo
AssertionError: expected [ 'id-reenvio-1', 'id-reenvio-1' ] to have a length of 3 but got 2
 FAIL  ... > mensagem estruturada também reenvia com id novo depois de falha definitiva
AssertionError: expected { …(4) } to match object { …(2) }
      Tests  3 failed | 12 passed (15)
```

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
O teste existente `reuses the same browser action id after an ambiguous dispatch failure` continua passando
sem alteração: a idempotência da resposta perdida com `status='sending'` segue igual. O diff de teste só
acrescenta casos; nenhum `expect`, `it` ou `describe` existente foi removido ou afrouxado.

## Prova
- `git diff --stat` (números no bloco FATOS MEDIDOS PELO FECHAR).
- vermelho antes: `npx vitest run src/services/__tests__/outbound-message.service.test.ts` → `Tests 3 failed | 12 passed (15)`
- verde depois: `npx vitest run src/services/__tests__/outbound-message.service.test.ts` → `Test Files 1 passed (1); Tests 15 passed (15)`

## Contrato de fronteira
- Não alterei RPC, migration, RLS nem Edge Function. O contrato do banco foi lido em
  `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` e
  `supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql`, e é o que o teste reproduz:
  `enqueue_*` devolve a linha existente e o `claim` do dispatch só aceita `sending`.
- Nenhum dado real, nenhuma URL de produção, nenhum push, PR ou deploy; nada de export/import/edição em massa.

## Concluído
- O reenvio da mesma mensagem depois de falha definitiva passa a criar mensagem nova (id novo, linha nova),
  com a falha anterior preservada no histórico.
- A idempotência do caso ambíguo (resposta perdida) segue intacta.
- Verificação do cartão: `npx vitest run src/services/__tests__/outbound-message.service.test.ts` →
  `Test Files 1 passed (1); Tests 15 passed (15)`; vizinhos → `Test Files 5 passed (5); Tests 42 passed (42)`.
- A mesma armadilha na drenagem da fila offline ficou registrada em comentário no cartão para cartão
  próprio (fora dos arquivos deste), sem alteração de contrato aqui.
