Especialista: hugo

## O que mudou (correção dos 3 pontos do revisor, em cima de c1e898c3f)
1. `src/hooks/chat/sendQueue.ts` (`enqueue`) — `task()` continua rodando no MESMO tick, mas um
   lançamento SÍNCRONO agora é convertido em rejeição: `try { execucao = Promise.resolve(task()); }
   catch (erro) { execucao = Promise.reject(erro); }`. Antes a exceção escapava do `enqueue`, a chave
   nunca saía de `ocupadas` e `isBusy` mentia até o próximo envio.
2. `src/components/inbox/chat/useChatPanelHandlers.ts` (`handleSend`) — a chamada saiu de fora do `try`
   e virou `await sendQueue.enqueue(...)` DENTRO dele (o tipo do transporte aceita `void`). Lançamento
   síncrono agora cai no `catch`: o rascunho volta e o agente é avisado; antes o editor já tinha sido
   limpo e o texto sumia sem toast.
3. `useChatPanelHandlers.ts` — na falha, o texto que falhou não é mais descartado quando o agente já
   digitou outra coisa: ele volta ACIMA do rascunho novo (`${originalText}\n${atual}`). Nada some e o
   aviso "Tente novamente" tem o que reenviar (antes o texto novo era mantido e o que falhou, perdido).

Teste existente ajustado (pedido pelo revisor): `useChatPanelHandlers.fila-serial.test.tsx` — o caso
"rascunho novo durante o voo" passou a exigir `'antiga\nnova'` em vez de `'nova'` e ganhou a asserção do
aviso. É expectativa MAIS estrita (prova os DOIS textos), não afrouxamento; foi o ponto 2 do revisor.
Testes novos: `sendQueue.test.ts` (tarefa que lança de forma síncrona vira rejeição e libera a fila) e
`useChatPanelHandlers.fila-serial.test.tsx` (transporte que lança de forma síncrona preserva o rascunho,
avisa e não anuncia enviado). Os dois FALHAM no commit anterior: `Promise.resolve(task())` propaga a
exceção direto do `enqueue` (o teste nem chega a ver a promessa rejeitada) e `sendQueue.enqueue` fora do
`try` deixa `inputValue === ''` sem toast.

## Onde o compositor era bloqueado (item 1, correção já entregue na passada anterior)
`handleSend` (`useChatPanelHandlers`) `await`ava `onSendMessage` = `useRealtimeInbox.handleSendMessage`,
que despacha no Edge e chamava `refreshActiveConversation()`. O editor só era liberado no fim do
despacho + do refetch da conversa e da lista; além disso `isSending` engolia em silêncio o 2º Enter.
Correção: fila serial por conversa (`createSerialSendQueue`) + remoção do refetch pós-envio.

## Cartões vizinhos lidos antes de mexer (mesmo trecho)
`~/hermes-workspaces/.assets/paridade-06/achados_1_envio.md` marca este trecho como compartilhado com
PH-03/EV1 (erros de envio/parsed de códigos), PH-04 (fila serial por contato + backoff — meu `sendQueue`
é só ordenação, não backoff), PH-28 e R2 (SendErrorBanner/refetch), e PD-77 (reenvio após falha).
Nada disso foi tocado: o diff fica no compositor, na fila e no refetch do Realtime.

## Prova (vermelho → verde)
`npx vitest run src/components/inbox src/hooks/inbox src/hooks/chat`
→ Test Files 261 passed | 3 skipped (264); Tests 2138 passed | 3 expected fail | 22 todo (2163).

Comando de verificação: `zapp-verify . --rapido`
