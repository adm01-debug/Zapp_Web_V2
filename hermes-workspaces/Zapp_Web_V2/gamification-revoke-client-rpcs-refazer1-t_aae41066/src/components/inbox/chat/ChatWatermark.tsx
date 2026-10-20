import { memo } from 'react';

/**
 * Fundo decorativo do painel de chat: padrão de brindes promocionais.
 * O desenho vem de /patterns/chat-brindes-640.webp aplicado como máscara;
 * cor e opacidade saem de --chat-pattern-* (ver styles/tokens.css).
 */
export const ChatWatermark = memo(function ChatWatermark() {
  return <div className="chat-watermark" aria-hidden="true" />;
});
