/**
 * SL-197 (inventário 029 · Inbox/Chat / Resiliência) — métrica de retry e tentativas por mensagem.
 *
 * O defeito: o banco JÁ grava `messages.delivery_attempt_count` (incrementado a cada
 * claim em `claim_message_delivery`, migration 20260909220000) e o tipo do cliente JÁ
 * o carrega (`Message extends Partial<MessageRow>`), mas NENHUMA superfície do chat o
 * exibia — uma mensagem reenviada ficava indistinguível de uma enviada na primeira
 * tentativa. A lacuna era de EXIBIÇÃO, sem tabela nova e sem DDL.
 *
 * Como este teste prova: renderiza o `MessageBubble` REAL (jsdom) com a linha crua de
 * `messages` e lê o texto/atributo que a linha de status do balão realmente produziu.
 * O indicador só existe quando houve REENVIO (>= 2 tentativas); com 0, 1 ou ausente
 * nada é renderizado (senão todo balão enviado ganharia ruído) e mensagem RECEBIDA
 * nunca mostra contador de tentativa de entrega.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) }), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: async () => ({ error: null }) }) }, functions: { invoke: async () => ({ data: null, error: null }) } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { name: 'Ana' } }) }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({
      children,
      whileHover: _whileHover,
      transition: _transition,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/inbox/DeletedMessagePlaceholder', () => ({ DeletedMessagePlaceholder: () => null }));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/MediaPreview', () => ({ DocumentPreview: () => null, VideoPreview: () => null }));
vi.mock('@/components/inbox/AudioMessagePlayer', () => ({ AudioMessagePlayer: () => null }));
vi.mock('@/components/inbox/InteractiveMessage', () => ({
  InteractiveMessageDisplay: () => null,
  ButtonResponseBadge: () => null,
}));
vi.mock('@/components/inbox/ReplyQuote', () => ({ QuotedMessage: () => null }));
vi.mock('@/components/inbox/TextToSpeechButton', () => ({ TextToSpeechButton: () => null }));
vi.mock('@/components/inbox/MessageReactions', () => ({
  MessageReactions: () => null,
  QuickReactionBar: () => null,
}));
vi.mock('@/components/inbox/chat/HighlightedText', () => ({
  HighlightedText: ({ text }: { text: string }) => <>{text}</>,
}));
vi.mock('@/components/inbox/chat/MessageHoverToolbar', () => ({ MessageHoverToolbar: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  AvatarImage: () => null,
}));

/** Linha crua de `messages` como o chat a entrega ao balão (useRealtimeMessages/buildConversation). */
function linha(overrides: Partial<Message>): Message {
  return {
    id: 'm-sl197',
    content: 'bom dia',
    sender: 'agent',
    timestamp: new Date(2026, 9, 5, 12, 0, 0),
    type: 'text',
    status: 'sent',
    ...overrides,
  } as Message;
}

function renderBubble(overrides: Partial<Message>) {
  return render(
    <MessageBubble
      message={linha(overrides)}
      isFirstInGroup
      isLastInGroup
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onScrollToMessage={vi.fn()}
      onInteractiveButtonClick={vi.fn()}
      onMessageDeleted={vi.fn()}
      registerRef={vi.fn()}
    />,
  );
}

describe('SL-197 — tentativas de entrega por mensagem no balão', () => {
  it('mensagem reenviada (3 tentativas) mostra o contador e o rótulo de reenvio', () => {
    const { container } = renderBubble({ delivery_attempt_count: 3 });
    const indicador = container.querySelector('[title="3 tentativas de envio"]');
    expect(indicador).not.toBeNull();
    expect(indicador?.textContent).toBe('3 tentativas');
    // A linha de status continua sendo a mesma: horário + estado + contador, sem
    // tocar no conteúdo da mensagem.
    expect(container.textContent).toContain('bom dia');
    expect(container.textContent).toContain('12:00');
  });

  it('mensagem entregue na primeira tentativa não ganha contador (sem ruído na linha)', () => {
    const { container } = renderBubble({ delivery_attempt_count: 1 });
    expect(container.querySelector('[title$="tentativas de envio"]')).toBeNull();
    expect(container.textContent).not.toContain('tentativas');
  });

  it('contador zerado (nunca reclamada para entrega) não é exibido', () => {
    const { container } = renderBubble({ delivery_attempt_count: 0 });
    expect(container.textContent).not.toContain('tentativas');
  });

  it('mensagem sem o campo (linha antiga/derivada) não é exibida', () => {
    const { container } = renderBubble({ delivery_attempt_count: undefined });
    expect(container.textContent).not.toContain('tentativas');
  });

  it('mensagem RECEBIDA nunca mostra tentativas de entrega (só o envio as tem)', () => {
    const { container } = renderBubble({ sender: 'contact', delivery_attempt_count: 4 });
    expect(container.textContent).not.toContain('tentativas');
  });

  it('mensagem com falha e várias tentativas mostra o contador ao lado do estado', () => {
    const { container } = renderBubble({ status: 'failed', delivery_attempt_count: 2 });
    const indicador = container.querySelector('[title="2 tentativas de envio"]');
    expect(indicador?.textContent).toBe('2 tentativas');
  });
});
