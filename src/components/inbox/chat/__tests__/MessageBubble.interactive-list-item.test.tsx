/**
 * Clique em linha de lista da mensagem interativa (achado do cartão).
 *
 * Antes: `MessageBubble` renderizava o `InteractiveMessageDisplay` SEM
 * `onListItemClick` — a linha só fechava o diálogo, sem registrar resposta (o
 * botão tinha o toast 'Botão clicado'; a linha, nada).
 *
 * Prova pelo balão REAL (MessageBubble) com o renderizador real: para mensagem
 * do cliente, a linha registra a resposta UMA vez e fecha o diálogo; para a
 * mensagem do próprio atendente, a linha é prévia — `disabled`, nada é enviado.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) }), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: async () => ({ error: null }) }) }, functions: { invoke: async () => ({ data: null, error: null }) } },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { name: 'Ana' } }) }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
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

const lista = {
  type: 'list' as const,
  body: 'Veja as opções',
  listButtonText: 'Ver opções',
  sections: [{ title: 'Produtos', rows: [{ id: 'r1', title: 'Canecas', description: 'personalizadas' }] }],
};

function renderBalao(sender: 'agent' | 'contact', onListItemClick = vi.fn()) {
  render(
    <MessageBubble
      message={
        {
          id: 'm-lista',
          content: 'Veja as opções',
          sender,
          timestamp: new Date('2026-10-15T12:00:00Z'),
          type: 'interactive',
          status: 'read',
          interactive: lista,
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
      onInteractiveListItemClick={onListItemClick}
      onMessageDeleted={vi.fn()}
      registerRef={vi.fn()}
    />,
  );
  return onListItemClick;
}

function abrirLista() {
  fireEvent.click(screen.getByRole('button', { name: /ver opções/i }));
}

describe('MessageBubble — clique em linha de lista interativa', () => {
  it('mensagem do cliente: registra a linha uma vez e fecha o diálogo', () => {
    const onListItemClick = renderBalao('contact');
    abrirLista();

    fireEvent.click(screen.getByRole('button', { name: /canecas/i }));

    expect(onListItemClick).toHaveBeenCalledTimes(1);
    expect(onListItemClick).toHaveBeenCalledWith('Produtos', 'r1', 'Canecas');
    // Diálogo fechou: a linha saiu da tela.
    expect(screen.queryByRole('button', { name: /canecas/i })).not.toBeInTheDocument();
  });

  it('mensagem do próprio atendente: linha é prévia (disabled) e nada é registrado', () => {
    const onListItemClick = renderBalao('agent');
    abrirLista();

    const linha = screen.getByRole('button', { name: /canecas/i });
    expect(linha).toBeDisabled();

    fireEvent.click(linha);
    expect(onListItemClick).not.toHaveBeenCalled();
  });
});
