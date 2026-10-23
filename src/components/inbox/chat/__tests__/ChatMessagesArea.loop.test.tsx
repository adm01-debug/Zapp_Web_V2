/**
 * Teste de regressão — React #301 / "Too many re-renders" no ChatMessagesArea.
 *
 * Causa raiz: getItemKey inline (closure nova a cada render) nas options do
 * useVirtualizer. Em @tanstack/react-virtual 3.13.x, options.getItemKey é
 * dependência do memo getMeasurementOptions do virtual-core; quando muda,
 * notify() → onChange → dispatch do useReducer acontece DURANTE a fase de
 * render (getVirtualItems é chamado no JSX) → render-phase update infinito.
 *
 * Com getItemKey estável (useCallback deps [messages]), o loop não ocorre.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message } from '@/types/chat';
import { ChatMessagesArea } from '../ChatMessagesArea';

// ResizeObserverMock que dispara o callback de forma assíncrona (setTimeout 0)
// para evitar stack overflow: o virtual-core re-observa itens dentro do callback
// de medição, o que causa recursão infinita se o disparo for síncrono.
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
});

// Mock pesado: o alvo é o virtualizer, não as bolhas.
vi.mock('../MessageBubble', () => ({
  MessageBubble: () => <div data-testid="bubble" style={{ height: 120 }} />,
}));

// RealtimeService é singleton com canal — mockar para não abrir sockets em teste.
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    subscribeToReactions: vi.fn(() => ({ topic: 'mock' })),
    removeChannel: vi.fn(async () => {}),
  },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => {}) },
}));

function makeMessage(id: string, content: string): Message {
  return {
    id,
    content,
    sender: 'contact',
    senderName: 'Contato',
    timestamp: new Date('2026-09-02T12:00:00Z'),
    status: 'delivered',
    type: 'text',
  };
}

describe('ChatMessagesArea — loop de re-render', () => {
  it('renderiza todas as bolhas sem loop infinito', async () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
      makeMessage(`msg-${i}`, `Mensagem ${i}`),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <div style={{ height: 600, overflowY: 'auto' }}>
          <ChatMessagesArea
            messages={messages}
            conversationId="conv-1"
            isLoading={false}
            hasMore={false}
            onLoadMore={vi.fn()}
          />
        </div>
      </QueryClientProvider>,
    );

    await waitFor(
      () => expect(screen.getAllByTestId('bubble')).toHaveLength(messages.length),
      { timeout: 5000 },
    );
  });
});
