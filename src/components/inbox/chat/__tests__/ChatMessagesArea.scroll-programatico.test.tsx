/**
 * Regressão #1991 — guard de scroll programático no ChatMessagesArea.
 *
 * Causa raiz: handleScroll chamava cancelScroll() sempre que isNearBottom era
 * false, incluindo durante scrollToIndex programático (scrollToBottom,
 * scrollToBottomAfterSend, scrollToMessage). Isso fazia o virtualizer
 * cancelar o próprio scroll antes de completar a animação.
 *
 * Fix: isProgrammaticScrollRef é setado como true antes de cada scrollToIndex
 * do sistema; handleScroll respeita esse flag e não cancela o scroll.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message } from '@/types/chat';
import { ChatMessagesArea, ChatMessagesAreaRef } from '../ChatMessagesArea';
import { createRef } from 'react';

// ---- mocks de infra -------------------------------------------------------

class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    setTimeout(() => {
      this.cb([{
        target,
        contentRect: { height: 120, width: 800, top: 0, left: 0, bottom: 120, right: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
        borderBoxSize: [{ blockSize: 120, inlineSize: 800 }],
        contentBoxSize: [{ blockSize: 120, inlineSize: 800 }],
        devicePixelContentBoxSize: [],
      }], this);
    }, 0);
  }
  unobserve() {}
  disconnect() {}
}

const scrollToIndexMock = vi.fn();
const cancelScrollMock = vi.fn();

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 600, width: 800, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 600, configurable: true });
  // Simula container com rolagem longe do fim para forçar isNearBottom = false
  Object.defineProperty(Element.prototype, 'scrollTop', { get: () => 0, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollHeight', { get: () => 2000, configurable: true });
});

vi.mock('@tanstack/react-virtual', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-virtual')>('@tanstack/react-virtual');
  return {
    ...actual,
    useVirtualizer: (opts: { count: number; getScrollElement: () => Element | null; estimateSize: () => number }) => ({
      getVirtualItems: () =>
        Array.from({ length: opts.count }, (_, i) => ({
          index: i, key: i, start: i * opts.estimateSize(), size: opts.estimateSize(),
          lane: 0, end: (i + 1) * opts.estimateSize(), measureElement: undefined,
        })),
      getTotalSize: () => opts.count * opts.estimateSize(),
      scrollToIndex: scrollToIndexMock,
      scrollToOffset: vi.fn(),
      measure: vi.fn(),
      options: opts,
    }),
  };
});

vi.mock('../MessageBubble', () => ({ MessageBubble: () => <div data-testid="bubble" style={{ height: 120 }} /> }));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({ topic: 'mock' })), removeChannel: vi.fn(async () => {}) },
}));
vi.mock('@/services/chat.service', () => ({ ChatService: { deleteMessage: vi.fn(async () => {}) } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

// ---- helpers ---------------------------------------------------------------

function makeMessage(id: string): Message {
  return {
    id, content: 'Mensagem de teste', sender: 'contact', senderName: 'Contato',
    timestamp: new Date('2026-09-02T12:00:00Z'), status: 'delivered', type: 'text',
  } as unknown as Message;
}

function makeProps(messages: Message[]) {
  return {
    messages,
    isContactTyping: false, typingUserName: 'Contato',
    ttsLoading: false, ttsPlaying: false, ttsMessageId: null as string | null,
    onSpeak: vi.fn(), onStop: vi.fn(), onReply: vi.fn(), onForward: vi.fn(),
    onCopy: vi.fn(), onScrollToMessage: vi.fn(), onInteractiveButtonClick: vi.fn(),
  };
}

// ---- testes ----------------------------------------------------------------

describe('ChatMessagesArea — guard de scroll programático (#1991)', () => {
  it('scrollToMessage não é cancelado pelo handleScroll subsequente', async () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeMessage(`msg-${i}`));
    const ref = createRef<ChatMessagesAreaRef>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <div style={{ height: 600, overflowY: 'auto' }}>
          <ChatMessagesArea ref={ref} {...makeProps(messages)} />
        </div>
      </QueryClientProvider>,
    );

    scrollToIndexMock.mockClear();
    cancelScrollMock.mockClear();

    // Chama scrollToMessage — deve definir isProgrammaticScrollRef = true antes
    // de chamar scrollToIndex
    await act(async () => {
      ref.current?.scrollToMessage('msg-3');
    });

    // scrollToIndex foi chamado
    expect(scrollToIndexMock).toHaveBeenCalledWith(3, { align: 'center' });
    // cancelScroll NÃO foi chamado (o guard protegeu o scroll programático)
    expect(cancelScrollMock).not.toHaveBeenCalled();
  });

  it('scrollToBottomAfterSend não é cancelado pelo handleScroll subsequente', async () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage(`msg-${i}`));
    const ref = createRef<ChatMessagesAreaRef>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <div style={{ height: 600, overflowY: 'auto' }}>
          <ChatMessagesArea ref={ref} {...makeProps(messages)} />
        </div>
      </QueryClientProvider>,
    );

    scrollToIndexMock.mockClear();
    cancelScrollMock.mockClear();

    await act(async () => {
      ref.current?.scrollToBottomAfterSend();
    });

    expect(scrollToIndexMock).toHaveBeenCalledWith(messages.length - 1, { align: 'end' });
    expect(cancelScrollMock).not.toHaveBeenCalled();
  });
});
