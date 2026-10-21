/**
 * Prova pela TELA: a resposta do cliente a botão/lista mostra o texto que ele tocou,
 * e não o id cru que vem do canal (`content` = id do botão / da linha da lista).
 *
 * O balão é REAL e os badges são os REAIS (nenhum mock de InteractiveMessage): o teste
 * lê o texto renderizado.
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
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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

function renderBalao(message: Partial<Message>) {
  return render(
    <MessageBubble
      message={
        {
          id: 'm-resposta',
          content: '',
          sender: 'contact',
          timestamp: new Date('2026-10-15T12:00:00Z'),
          type: 'text',
          status: 'read',
          ...message,
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

describe('MessageBubble — resposta a botão/lista', () => {
  it('mostra o texto do botão e esconde o id cru', () => {
    const { container } = renderBalao({
      content: 'b-sim',
      buttonResponse: { buttonId: 'b-sim', buttonTitle: 'Sim' },
    });

    expect(container.textContent).toContain('Resposta: Sim');
    expect(container.textContent).not.toContain('b-sim');
  });

  it('mostra a seção e o item da lista tocados e esconde o id cru', () => {
    const { container } = renderBalao({
      content: 'r-cons',
      listResponse: { sectionTitle: 'Serviços', itemTitle: 'Consultoria' },
    });

    expect(container.textContent).toContain('Serviços:');
    expect(container.textContent).toContain('Consultoria');
    expect(container.textContent).not.toContain('r-cons');
  });
});
