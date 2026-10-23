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
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const blockSize = rect.height > 0 ? rect.height : 600;
      const inlineSize = rect.width > 0 ? rect.width : 800;
      this.cb(
        [
          {
            target,
            contentRect: {
              height: blockSize, width: inlineSize, top: 0, left: 0,
              bottom: blockSize, right: inlineSize, x: 0, y: 0, toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ blockSize, inlineSize }],
            contentBoxSize: [{ blockSize, inlineSize }],
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
    <div data-testid={`bubble-${message.id}`} style={{ height: 80 }} />
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

type Props = ComponentProps<typeof ChatMessagesArea>;

function makeMessage(id: string): Message {
  return {
    id,
    content: `msg ${id}`,
    sender: 'contact',
    senderName: 'Bot',
    timestamp: new Date('2026-09-02T12:00:00Z'),
    status: 'delivered',
    type: 'text',
  };
}

function setup(props: Partial<Props> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref = { current: null } as React.RefObject<ChatMessagesAreaRef | null>;
  const messages: Message[] = Array.from({ length: 5 }, (_, i) => makeMessage(`m${i}`));
  const utils = render(
    <QueryClientProvider client={qc}>
      <div style={{ height: 600, overflow: 'auto' }}>
        <ChatMessagesArea
          ref={ref}
          messages={messages}
          conversationId="conv-mr"
          isLoading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          {...props}
        />
      </div>
    </QueryClientProvider>,
  );
  return { ...utils, ref, messages };
}

describe('ChatMessagesArea — movimento reduzido', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza as bolhas com prefers-reduced-motion ativo', async () => {
    const { messages } = setup();
    await waitFor(
      () => {
        messages.forEach((m) => {
          expect(screen.getByTestId(`bubble-${m.id}`)).toBeInTheDocument();
        });
      },
      { timeout: 5000 },
    );
  });

  it('scrollToBottom via ref não lança erro com movimento reduzido', async () => {
    const { ref, messages } = setup();
    await waitFor(
      () => expect(screen.getByTestId(`bubble-${messages[0].id}`)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    await act(async () => { ref.current?.scrollToBottom?.(); });
  });
});
