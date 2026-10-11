Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useWhisperMessagesMutation.ts (novo): envio do sussurro como nota interna. Valida contato com UUID, resolve o PERFIL do remetente (auth.uid -> profiles.id, como a RLS "Users can insert own whisper messages" exige) e o RESPONSÁVEL atual (contacts.assigned_to), e grava em `whisper_messages` por `insert`. Devolve `{ ok }` ou `{ ok:false, motivo }` — nunca lança para o compositor. Avisa o contador local no sucesso.
- src/components/inbox/chat/useChatPanelHandlers.ts: modo sussurro no compositor — estado `isWhisper`/`setIsWhisper`/`toggleWhisper` (default desligado) e, no `handleSend`, o ramo do sussurro RETORNA antes de qualquer caminho de canal: `onSendMessage` não é chamado nem no envio, nem no retry. Sucesso limpa o compositor e desliga o modo; falha MANTÉM o texto e avisa a causa (sem responsável / perfil não carregado / contato sem UUID / anexo pendente / erro). Escape desliga o modo.
- src/hooks/chat/useWhisperCount.ts (novo): contador de sussurros da conversa para o selo do cabeçalho, com `count`/`head` (contagem no servidor, sem trazer conteúdo), restrito ao que a RLS já deixa visível.
- src/components/inbox/chat/__tests__/useChatPanelHandlers.sussurro.test.tsx (novo): prova os caminhos acima com o hook REAL.

## Prova
- vermelho antes (ramo do sussurro desligado de propósito): `npx vitest run src/components/inbox/chat/__tests__/useChatPanelHandlers.sussurro.test.tsx` -> `Tests  5 failed | 3 passed (8)`; o texto "sussurrado" caía no canal (`expected vi.fn() not to be called ... Number of calls: 1`).
- verde depois: mesmo comando -> `Test Files  1 passed (1); Tests  8 passed (8)`.
- regressão da área: `npx vitest run src/components/inbox/chat/__tests__ src/components/inbox/__tests__/ChatPanel.*` -> `Test Files  33 passed (33); Tests  233 passed (233)`.

## Decisões que o cartão pedia para relatar
- Destino do sussurro: `whisper_messages.target_agent_id` é NOT NULL com FK para `profiles(id)` (schema-catalog + migration 20260317214556, sem ALTER depois). Não existe perfil de "fila", então "à fila" NÃO é representável nessa tabela: o sussurro vai para o RESPONSÁVEL ATUAL da conversa (`contacts.assigned_to`) e, sem responsável, o envio é RECUSADO com aviso e o texto é preservado. Isso é o mesmo precedente do painel (WhisperMode exige destino escolhido).
- Anexo: o compositor não guarda o anexo (ele vive no `FileUploader`); expus a checagem como opção opcional `temAnexoPendente` do handler, para a tela que monta o botão ligá-la. Sem ela, o sussurro é texto puro.
- Trocar de conversa já zera o compositor: o `ChatPanel` é remontado por `key={conversation.id}` (RealtimeInboxView:334), então não precisei de reset no hook.

## O que NÃO fiz e por quê
- Não toquei em ChatPanel.tsx / ChatInputArea.tsx / WhisperMode.tsx (tela): o botão de sussurro e o selo do cabeçalho são da área de componentes; o handler já EXPORTA `isWhisper`, `setIsWhisper` e `toggleWhisper` para essa tela ligar.
- Nenhum DDL: a tabela e a RLS de `whisper_messages` já existem; não mexi em migration.
