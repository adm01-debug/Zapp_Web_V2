/**
 * Tamanho do texto do chat escolhido pelo usuário e lembrado.
 *
 * Prova pelo balão REAL: renderiza o `MessageBubble` (jsdom) e lê a classe que o texto
 * da mensagem recebeu. Antes desta entrega o texto era `text-sm` fixo (0.875rem); agora é
 * `.chat-message-text`, que lê `--chat-font-size` (a variável escrita pela aba Aparência).
 * Sem essa troca a escolha do usuário não chegaria às bolhas — o contrato de CSS que liga a
 * classe à variável é provado em src/styles/__tests__/chatTextSize.test.ts.
 *
 * Nada de literal de tamanho aqui: se a classe do componente mudar, o teste cai.
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
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, whileHover: _whileHover, transition: _transition, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...rest}>{children}</div>,
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

function renderBalao(enviado: boolean) {
  return render(
    <MessageBubble
      message={
        {
          id: 'm-chat-font',
          content: 'bom dia',
          sender: enviado ? 'agent' : 'contact',
          timestamp: new Date('2026-10-13T12:00:00Z'),
          type: 'text',
          status: 'read',
        } as Message
      }
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

describe('MessageBubble — texto do balão lê --chat-font-size', () => {
  it('o texto da mensagem enviada usa .chat-message-text (e não text-sm fixo)', () => {
    const { container, unmount } = renderBalao(true);
    const texto = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'bom dia');
    expect(texto).toBeDefined();
    expect(texto).toHaveClass('chat-message-text');
    expect(texto).not.toHaveClass('text-sm');
    unmount();
  });

  it('o texto da mensagem recebida também usa .chat-message-text', () => {
    const { container } = renderBalao(false);
    const texto = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'bom dia');
    expect(texto).toHaveClass('chat-message-text');
  });
});
