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

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  private static _depth = 0;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    if (ResizeObserverMock._depth > 0) return;
    ResizeObserverMock._depth++;
    try {
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
    } finally {
      ResizeObserverMock._depth--;
    }
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      height: 600, width: 800, top: 0, left: 0,
      right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    }),
  });
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

vi.mock('@/hooks/reactions/useBatchReactions', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReactionsBatchProvider: ({ children }: { children: any }) => children,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => Element | null;
    getItemKey?: (i: number) => unknown;
  }) => {
    const est = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      key: opts.getItemKey ? opts.getItemKey(i) : i,
      start: i * est,
      size: est,
      lane: 0 as const,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * est,
      measureElement: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scrollToIndex: vi.fn().mockImplementation((index: number, _o?: any) => {
        const el = opts.getScrollElement?.();
        if (el) el.scrollTo({ top: index * est, behavior: 'auto' });
      }),
      measurementsCache: items,
      cancelScroll: vi.fn(),
    };
  },
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
      <div style={{ height: 600, overflowY: 'auto' }}>
        <ChatMessagesArea ref={(r) => { areaRef.current = r; }} {...props} />
      </div>
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
