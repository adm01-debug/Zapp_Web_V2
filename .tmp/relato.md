Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/chat/useChatPanelHandlers.ts: `handleInteractiveButtonClick` deixou de só
  mostrar o aviso 'Botão clicado' e passou a RESPONDER ao cliente pelo caminho canônico do
  compositor (`onSendMessage(titulo, replyToId)` → `enqueue_outbound_message` com
  `client_message_id` estável). O título vem de `button.title ?? button.text ?? button.id`
  (mesma ordem que o envio de mensagem interativa já usa no arquivo); vazio = não envia.
  `reply_to`: passa `replyToMessageRef.current?.id ?? null` — o único alvo de resposta disponível
  dentro do handler (vide "O que NÃO fiz").
- Mesmo handler: trava de reenvio — `useRef(false)` enquanto o envio está em andamento e
  `useRef({key, at})` para ignorar clique repetido no MESMO botão dentro de
  `INTERACTIVE_BUTTON_DEDUP_MS` (5 s após um envio BEM-SUCEDIDO; falha libera a trava). Chave =
  `button.id ?? título` (o handler só recebe o botão; a mensagem não faz parte do contrato atual).
- Falha do envio: `log.error` + toast destrutivo "Erro ao responder" (o antigo nunca tratava erro).
- src/components/inbox/chat/__tests__/useChatPanelHandlers.interactive-button.test.tsx: novo, 6 casos.

## Prova
- vermelho antes (handler original restaurado com `git show HEAD:...`): `npx vitest run
  src/components/inbox/chat/__tests__/useChatPanelHandlers.interactive-button.test.tsx` →
  `Test Files 1 failed (1); Tests 6 failed (6)`
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 6 passed (6)`
- regressão da área: `npx vitest run src/components/inbox/chat/__tests__ src/components/inbox/__tests__`
  → `Test Files 110 passed (110); Tests 725 passed (725)`

## Critério de pronto (do cartão)
- "Clique no botão envia o título do botão ao cliente": useChatPanelHandlers.ts + teste
  `envia o título do botão pelo caminho canônico` (onSendMessage chamado 1x com o título).
- "sem duplicar": teste `segundo clique no mesmo botão dentro de 5s não envia de novo` e teste
  `clique concorrente durante o envio não duplica` (falha mostra erro e libera a trava).
- Sem cano falso: teste `não usa mais o aviso fake 'Botão clicado'`.
- Fallback sem título: teste `sem título usa o id do botão`.

## O que NÃO fiz e por quê
- Reply apontando para a PRÓPRIA mensagem interativa: o handler do botão recebe só
  `(button: InteractiveButton)`; a mensagem não chega até ele (InteractiveMessage.tsx →
  MessageBubble.tsx → ChatMessagesArea.tsx). Propagar o id exigiria editar esses 3 arquivos, fora
  do "ARQUIVOS QUE PODE TOCAR". Usei o alvo de resposta já existente do compositor
  (`replyToMessageRef`), que é o `reply_to` "quando houver" disponível no escopo deste cartão.
- Não afrouxei nenhum teste existente; nenhum arquivo fora dos permitidos foi tocado.
