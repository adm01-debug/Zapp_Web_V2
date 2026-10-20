Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/chat/MessageBubbleMediaMissing.tsx` (NOVO): cartão discreto de borda
  tracejada com ícone (`ImageOff`) e o texto "Mídia indisponível" + "<tipo> não foi recebida.",
  no mesmo espírito do `MessageBubbleUnsupported`. `role="note"` com `aria-label`; ícone
  decorativo. Sem inventar URL e sem usar o texto da mensagem como legenda. Só tokens do
  sistema (`border-dashed`, `bg-card`/`bg-muted`, `text-muted-foreground`); nenhum selo de
  canal/origem. Tem o slot `action` para o MR2 plugar a ação de retentativa DEPOIS — sem
  `action` (hoje) não renderiza botão nenhum.
- `src/components/inbox/chat/MessageBubble.tsx`: os previews de mídia (imagem, vídeo, áudio,
  documento, figurinha) só desenhavam dentro de `message.mediaUrl &&`; sem URL nenhum ramo
  casava e o balão saía VAZIO. Adicionei `mediaSemUrl` (tipo de mídia conhecido e sem URL) e o
  ramo que renderiza o fallback; `data-testid="media-indisponivel"` no cartão. As constantes
  `midiaInline` substituem a condição repetida de imagem/vídeo no padding do balão e no
  posicionamento do horário, para o fallback NÃO herdar o `p-0`/horário absoluto do preview
  colado na borda.
- `src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx` (NOVO): prova que
  RENDERIZA o `MessageBubble` real. Cobre os 5 tipos de mídia sem URL (cartão presente, com o
  rótulo do tipo), o `role=note`/`aria-label`, o balão recebido e o enviado, ausência de
  elemento com `src` (nada de URL inventada), ausência de botão de retentativa (MR2),
  o horário normal, e os casos NEGATIVOS: com URL não aparece o cartão e mensagem de texto
  não é afetada.

## Por que um arquivo NOVO é indispensável (ponto 1 do juiz)
- O cartão pede o fallback com `data-testid="media-indisponivel"` e um slot para o MR2 plugar a
  ação depois ("deixe o componente pronto"). Isso é um componente próprio. Ele poderia morar
  dentro do `MessageBubbleUnsupported.tsx`, mas aquele é o fallback do `type === 'unsupported'`
  (poll/view_once/contact) e não tem slot de ação; juntar os dois acoplaria fallbacks distintos e
  mexeria em código fora do defeito. Um arquivo novo de ~60 linhas mantém o diff do
  `MessageBubble.tsx` em 24+/3-, prova que o balão renderiza o cartão e deixa o fallback
  reutilizável pelo MR2. O cartão autoriza "os arquivos que o defeito exigir" e cita o
  `MessageBubbleUnsupported.tsx` como exemplo desse tipo de componente de fallback.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx`
  com `MessageBubble.tsx` revertido à base → `Test Files 1 failed (1); Tests 7 failed | 9 passed (16)`
  (falha em `expected null not to be null` no `[data-testid="media-indisponivel"]`).
- verde depois: `npx vitest run src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx`
  → `Test Files 1 passed (1); Tests 16 passed (16)`.
- sem regressão nos testes que já existiam do balão:
  `MessageBubbleUnsupported` + `MessageBubble.saveReceivedSticker` + `MessageBubble.tentativas`
  + `MessageBubble.contrasteStatus` → `Test Files 4 passed (4); Tests 40 passed (40)`.

## O que NÃO fiz e por quê
- Nenhum botão de "tentar de novo": o cartão reserva isso ao MR2; deixei só o slot `action`.
  Não há cartão MR2 no quadro para integrar nesta rodada.
- Não mexi na legenda de imagem/vídeo com `content` (comportamento que já existia, fora do
  defeito). O fallback só substitui o preview de mídia ausente.
- O horário continua saindo em todo balão, incluindo o do fallback (provado no teste).
