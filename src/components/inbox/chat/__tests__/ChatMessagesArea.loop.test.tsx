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
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { Message } from '@/types/chat';
import { ChatMessagesArea } from '../ChatMessagesArea';

// jsdom não tem ResizeObserver — mock garante comportamento determinístico.
class ResizeObserverMock {
  observe() {}
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
  } as unknown as Message;
}

function makeProps(messages: Message[]) {
  return {
    messages,
    isContactTyping: false,
    typingUserName: 'Contato',
    ttsLoading: false,
    ttsPlaying: false,
    ttsMessageId: null as string | null,
    onSpeak: vi.fn(),
    onStop: vi.fn(),
    onReply: vi.fn(),
    onForward: vi.fn(),
    onCopy: vi.fn(),
    onScrollToMessage: vi.fn(),
    onInteractiveButtonClick: vi.fn(),
  };
}

describe('ChatMessagesArea — loop de render (React #301)', () => {
  it('não entra em loop de re-render ao renderizar mensagens (regressão f668828)', () => {
    const messages = [
      makeMessage('msg-1', 'Primeira mensagem com conteúdo razoável para altura'),
      makeMessage('msg-2', 'Segunda mensagem'),
      makeMessage('msg-3', 'Terceira mensagem'),
    ];

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Se o loop existir, o próprio React lança "Too many re-renders"
    // durante o render — a asserção é a ausência do throw.
    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <div style={{ height: 600, overflowY: 'auto' }}>
            <ChatMessagesArea {...makeProps(messages)} />
          </div>
        </QueryClientProvider>,
      ),
    ).not.toThrow();
  }, 15000);

  it('suporta troca da lista de mensagens (nova mensagem chega) sem loop', () => {
    const initial = [makeMessage('msg-1', 'Oi'), makeMessage('msg-2', 'Tudo bem?')];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <div style={{ height: 600, overflowY: 'auto' }}>
          <ChatMessagesArea {...makeProps(initial)} />
        </div>
      </QueryClientProvider>,
    );

    const withNew = [...initial, makeMessage('msg-3', 'Nova mensagem chegando')];
    expect(() =>
      rerender(
        <QueryClientProvider client={queryClient}>
          <div style={{ height: 600, overflowY: 'auto' }}>
            <ChatMessagesArea {...makeProps(withNew)} />
          </div>
        </QueryClientProvider>,
      ),
    ).not.toThrow();

    unmount();
  }, 15000);
});
