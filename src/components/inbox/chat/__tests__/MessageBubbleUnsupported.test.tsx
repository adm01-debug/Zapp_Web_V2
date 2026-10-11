/**
 * R2-INB — fallback visual para mensagens que o Zapp Web V2 não renderiza.
 *
 * O defeito: com `message.type === 'unsupported'` (contrato criado pelo cartão pai em
 * `src/types/chat.ts`, campos `type` e `unsupportedKind`) o `MessageBubble` não tinha ramo
 * nenhum — o balão ficava vazio. A prova RENDERIZA o `MessageBubble` REAL e lê o que aparece
 * na tela: o texto certo por `unsupportedKind`, o glifo PRÓPRIO de cada tipo com o movimento
 * próprio, o `role="note"` com o rótulo acessível, o conteúdo preservado quando existe, o
 * brilho diagonal do hover e que a mensagem de texto comum continua idêntica.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { Message, type UnsupportedMessageKind } from '@/types/chat';

const reduced = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', () => {
  const passthrough = ({
    children,
    whileHover: _whileHover,
    transition: _transition,
    initial: _initial,
    animate: _animate,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...rest}>{children}</div>;
  return {
    motion: new Proxy({}, { get: () => passthrough }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => reduced.value,
  };
});

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

function linha(overrides: Partial<Message>): Message {
  return {
    id: 'm-unsupported',
    content: '',
    sender: 'contact',
    timestamp: new Date(2026, 9, 11, 12, 0, 0),
    type: 'unsupported',
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

describe('MessageBubble — fallback de mensagem não suportada', () => {
  it('enquete (poll) mostra o texto para abrir no celular', () => {
    const { container } = renderBubble({ unsupportedKind: 'poll' });
    expect(container.textContent).toContain('Enquete. Abra no celular para ver as opções.');
  });

  it('visualização única (view_once) mostra o texto próprio do tipo', () => {
    const { container } = renderBubble({ unsupportedKind: 'view_once' });
    expect(container.textContent).toContain('Mensagem de visualização única. Abra no celular.');
  });

  it('contato compartilhado (contact) mostra o texto próprio do tipo', () => {
    const { container } = renderBubble({ unsupportedKind: 'contact' });
    expect(container.textContent).toContain('Contato compartilhado. Abra no celular.');
  });

  it('tipo desconhecido (other) cai no aviso genérico — o balão nunca fica vazio', () => {
    const { container } = renderBubble({ unsupportedKind: 'other' });
    expect(container.textContent).toContain('Tipo de mensagem não suportado nesta tela.');
  });

  it('sem unsupportedKind (linha antiga) usa o aviso genérico, sem quebrar', () => {
    const { container } = renderBubble({ unsupportedKind: undefined });
    expect(container.textContent).toContain('Tipo de mensagem não suportado nesta tela.');
  });

  it('é um role=note com rótulo acessível que diz o tipo e o conteúdo', () => {
    const { container } = renderBubble({ unsupportedKind: 'contact', content: 'João — +55 11 0000-0000' });
    const nota = container.querySelector('[role="note"]');
    expect(nota).not.toBeNull();
    const rotulo = nota?.getAttribute('aria-label') ?? '';
    expect(rotulo).toContain('Contato compartilhado. Abra no celular.');
    expect(rotulo).toContain('João — +55 11 0000-0000');
    // o conteúdo preservado também é visível
    expect(container.textContent).toContain('João — +55 11 0000-0000');
  });

  it('o horário continua saindo como nas outras bolhas', () => {
    const { container } = renderBubble({ unsupportedKind: 'poll' });
    expect(container.textContent).toContain('12:00');
  });

  it('mensagem de texto comum não muda: nenhum fallback é renderizado', () => {
    const { container } = renderBubble({ type: 'text', content: 'bom dia', unsupportedKind: undefined });
    expect(container.querySelector('[role="note"]')).toBeNull();
    expect(container.textContent).toContain('bom dia');
    expect(container.textContent).not.toContain('não suportado');
  });

  // --- Glifo próprio de cada tipo (variação pedida na direção de design) ---

  const CASOS: Array<[UnsupportedMessageKind, string]> = [
    ['poll', 'poll-bars'],
    ['view_once', 'view-once-ring'],
    ['contact', 'contact-card'],
    ['other', 'static'],
  ];

  it.each(CASOS)('%s desenha o glifo próprio (%s) e só ele', (kind, glifo) => {
    const { container } = renderBubble({ unsupportedKind: kind });
    const alvo = container.querySelector(`[data-anim="${glifo}"]`);
    expect(alvo).not.toBeNull();
    // exatamente um glifo por cartão — não há "um pulso para todos"
    expect(container.querySelectorAll('[data-anim]')).toHaveLength(1);
  });

  // --- Movimento por tipo e movimento reduzido ---

  it('com movimento permitido o glifo do tipo está ativo', () => {
    const { container } = renderBubble({ unsupportedKind: 'view_once' });
    const anel = container.querySelector('[data-anim="view-once-ring"]');
    expect(anel?.getAttribute('data-anim-active')).toBe('true');
  });

  it('com movimento reduzido nada anima e o cartão se declara reduzido', () => {
    reduced.value = true;
    try {
      const { container } = renderBubble({ unsupportedKind: 'poll' });
      expect(
        container.querySelector('[data-testid="message-unsupported"]')?.getAttribute('data-motion'),
      ).toBe('reduced');
      const animados = container.querySelectorAll('[data-anim]');
      expect(animados.length).toBeGreaterThan(0);
      animados.forEach((el) => {
        expect(el.getAttribute('data-anim-active')).toBe('false');
        // nenhuma utilidade de animação do Tailwind sobra no elemento
        expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)animate-/);
      });
    } finally {
      reduced.value = false;
    }
  });

  it('o tipo estático (other) nunca anima, mesmo com movimento permitido', () => {
    const { container } = renderBubble({ unsupportedKind: 'other' });
    expect(container.querySelector('[data-anim="static"]')?.getAttribute('data-anim-active')).toBe('false');
  });

  // --- Brilho diagonal do hover ---

  it('o brilho diagonal é uma camada com group-hover e motion-safe', () => {
    const { container } = renderBubble({ unsupportedKind: 'poll' });
    const brilho = container.querySelector('[data-testid="unsupported-glow"]');
    expect(brilho).not.toBeNull();
    const classes = brilho?.getAttribute('class') ?? '';
    expect(classes).toContain('group-hover/unsupported');
    expect(classes).toContain('motion-safe:');
    // começa invisível e só aparece no hover
    expect(classes).toContain('opacity-0');
  });
});
