/**
 * MR1 — balão de mídia SEM URL.
 *
 * O defeito: os previews do `MessageBubble` (imagem, vídeo, áudio, documento, figurinha) só
 * desenhavam DENTRO de `message.mediaUrl &&`; com a linha sem URL nenhum ramo casava e o balão
 * saía VAZIO — sem motivo visível para o atendente.
 *
 * A prova RENDERIZA o `MessageBubble` REAL e lê o que aparece na tela: o cartão
 * `[data-testid="media-indisponivel"]` com "Mídia indisponível" e o rótulo do tipo, para os
 * cinco tipos de mídia; e QUE ELE NÃO aparece quando há URL nem em mensagem de texto (não pode
 * virar ruído). Também prende as regras do cartão: nenhuma URL inventada (nenhum elemento com
 * `src`) e nenhuma ação falsa (não há botão de "tentar de novo" nesta rodada — é do MR2).
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';

const MEDIA_URL = 'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/x.webp';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        copy: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: async () => ({ error: null }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
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

// Previews reais não entram nesta prova: o alvo é o RAMO do balão, não o player/lightbox.
vi.mock('@/components/inbox/DeletedMessagePlaceholder', () => ({ DeletedMessagePlaceholder: () => null }));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/MediaPreview', () => ({
  DocumentPreview: () => null,
  VideoPreview: () => null,
}));
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

function linha(overrides: Partial<Message>): Message {
  return {
    id: 'm-midia',
    content: '',
    sender: 'contact',
    timestamp: new Date(2026, 9, 13, 12, 0, 0),
    type: 'image',
    status: 'delivered',
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

const CASOS: Array<[Message['type'], string]> = [
  ['image', 'Imagem'],
  ['video', 'Vídeo'],
  ['audio', 'Áudio'],
  ['document', 'Documento'],
  ['sticker', 'Figurinha'],
];

describe('MessageBubble — mídia sem URL não deixa o balão vazio', () => {
  it.each(CASOS)('tipo %s sem mediaUrl mostra "Mídia indisponível" com o rótulo (%s)', (type, label) => {
    const { container } = renderBubble({ type, mediaUrl: undefined });

    const cartao = container.querySelector('[data-testid="media-indisponivel"]');
    expect(cartao).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="media-indisponivel"]')).toHaveLength(1);
    expect(cartao?.getAttribute('data-media-label')).toBe(label);
    expect(container.textContent).toContain('Mídia indisponível');
    expect(container.textContent).toContain(`${label} não foi recebida.`);
  });

  it('é um role=note com rótulo acessível que nomeia o que falta', () => {
    const { container } = renderBubble({ type: 'video', mediaUrl: undefined });

    const nota = container.querySelector('[role="note"]');
    expect(nota).not.toBeNull();
    expect(nota?.getAttribute('aria-label')).toContain('Vídeo indisponível');
    // o ícone é decorativo
    const svg = nota?.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('vale para o balão RECEBIDO e para o ENVIADO (nenhum dos dois fica vazio)', () => {
    const recebido = renderBubble({ type: 'image', mediaUrl: undefined, sender: 'contact' });
    expect(recebido.container.querySelector('[data-testid="media-indisponivel"]')).not.toBeNull();
    recebido.unmount();

    const enviado = renderBubble({ type: 'document', mediaUrl: undefined, sender: 'agent' });
    expect(enviado.container.querySelector('[data-testid="media-indisponivel"]')).not.toBeNull();
  });

  it('não inventa URL: nenhum elemento de mídia com src é renderizado', () => {
    const { container } = renderBubble({ type: 'image', mediaUrl: undefined });

    expect(container.querySelectorAll('[src]')).toHaveLength(0);
    expect(container.querySelector('img,video,audio,source')).toBeNull();
  });

  it('não tem ação falsa: nenhum botão de retentativa nesta rodada (MR2)', () => {
    const { container } = renderBubble({ type: 'sticker', mediaUrl: undefined });

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/tentar de novo|tentar novamente|recarregar/i);
  });

  it('o horário continua saindo como nas outras bolhas', () => {
    const { container } = renderBubble({ type: 'audio', mediaUrl: undefined });
    expect(container.textContent).toContain('12:00');
  });

  it.each(CASOS)('tipo %s COM mediaUrl NÃO mostra o fallback (nada de ruído)', (type) => {
    const { container } = renderBubble({ type, mediaUrl: MEDIA_URL });

    expect(container.querySelector('[data-testid="media-indisponivel"]')).toBeNull();
    expect(container.textContent).not.toContain('Mídia indisponível');
  });

  it('mensagem de texto não é afetada: nenhum fallback e o texto continua', () => {
    const { container } = renderBubble({ type: 'text', content: 'bom dia', mediaUrl: undefined });

    expect(container.querySelector('[data-testid="media-indisponivel"]')).toBeNull();
    expect(container.textContent).toContain('bom dia');
  });
});
