/**
 * Movimento reduzido (paridade V3): com `prefers-reduced-motion`, a entrada do
 * grupo e o selo "Nova mensagem enviada" continuam aparecendo, mas NADA se
 * desloca — so a opacidade muda. O teste força `useReducedMotion` ligado.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message } from '@/types/chat';
import { ChatMessagesArea, type ChatMessagesAreaRef } from '../ChatMessagesArea';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => true };
});

vi.mock('@tanstack/react-virtual', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-virtual')>('@tanstack/react-virtual');
  return {
    ...actual,
    useVirtualizer: (opts: { count: number; getScrollElement: () => Element | null; estimateSize: () => number }) => ({
      getVirtualItems: () =>
        Array.from({ length: opts.count }, (_, i) => ({
          index: i,
          key: i,
          start: i * opts.estimateSize(),
          size: opts.estimateSize(),
          lane: 0,
          end: (i + 1) * opts.estimateSize(),
          measureElement: undefined,
        })),
      getTotalSize: () => opts.count * opts.estimateSize(),
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      measure: vi.fn(),
      options: opts,
    }),
  };
});

class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    setTimeout(() => {
      this.cb(
        [
          {
            target,
            contentRect: {
              height: 120, width: 800, top: 0, left: 0,
              bottom: 120, right: 800, x: 0, y: 0, toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ blockSize: 120, inlineSize: 800 }],
            contentBoxSize: [{ blockSize: 120, inlineSize: 800 }],
            devicePixelContentBoxSize: [],
          },
        ],
        this,
      );
    }, 0);
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
});

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string } }) => (
    <div data-testid="bubble" data-message-id={message.id} />
  ),
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    subscribeToReactions: vi.fn(() => ({ topic: 'mock' })),
    removeChannel: vi.fn(async () => {}),
  },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => {}) },
}));

function makeMessage(id: string, sender: 'contact' | 'agent', timestamp: Date): Message {
  return {
    id,
    content: `mensagem ${id}`,
    sender,
    senderName: 'Contato',
    timestamp,
    status: 'delivered',
    type: 'text',
  } as unknown as Message;
}

type AreaProps = ComponentProps<typeof ChatMessagesArea>;

function makeProps(messages: Message[]): AreaProps {
  return {
    messages,
    isContactTyping: false,
    typingUserName: 'Contato',
    ttsLoading: false,
    ttsPlaying: false,
    ttsMessageId: null,
    onSpeak: vi.fn(),
    onStop: vi.fn(),
    onReply: vi.fn(),
    onForward: vi.fn(),
    onCopy: vi.fn(),
    onScrollToMessage: vi.fn(),
    onInteractiveButtonClick: vi.fn(),
  };
}

const areaRef: { current: ChatMessagesAreaRef | null } = { current: null };

beforeEach(() => {
  areaRef.current = null;
});

function renderArea(props: AreaProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatMessagesArea ref={(r) => { areaRef.current = r; }} {...props} />
    </QueryClientProvider>,
  );
}

describe('ChatMessagesArea — movimento reduzido', () => {
  it('entrada do grupo e selo aparecem sem deslocamento (so opacidade)', async () => {
    renderArea(makeProps([
      makeMessage('msg-1', 'contact', new Date('2026-10-12T12:00:00Z')),
      makeMessage('msg-2', 'contact', new Date('2026-10-12T12:06:00Z')),
    ]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    });

    // O cabecalho do grupo novo continua presente (fade de opacidade).
    const entrada = screen.getByTestId('group-entry-fade');
    expect(entrada).toBeInTheDocument();
    expect(entrada.style.transform === '' || entrada.style.transform === 'none').toBe(true);

    act(() => { areaRef.current?.scrollToBottomAfterSend(); });

    const selo = screen.getByTestId('sent-badge');
    expect(selo).toHaveTextContent(/nova mensagem enviada/i);
    // Sem translate: com movimento reduzido nada se desloca.
    expect(selo.style.transform === '' || selo.style.transform === 'none').toBe(true);
  });
});
