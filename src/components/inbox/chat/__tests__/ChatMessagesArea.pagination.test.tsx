/**
 * R2-INB-004 — consumidor do historico antigo na superficie de rolagem.
 *
 * O cursor de paginacao ja existia no hook (`useMessages.loadOlderMessages`),
 * mas a area visivel de mensagens nao oferecia nenhum controle para alcancar o
 * historico anterior. Este teste cobre o contrato do consumidor:
 *   - controle acessivel no topo (role/nome/estado de carregamento);
 *   - um clique = uma chamada, e o carregamento bloqueia disparo concorrente;
 *   - prepend nao move a mensagem que estava ancorada no topo;
 *   - fim do historico anunciado de forma acessivel.
 *
 * Todas as mensagens usam o MESMO timestamp de proposito: a ancora e o item
 * (key do virtualizer), nunca o timestamp.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message } from '@/types/chat';
import { ChatMessagesArea } from '../ChatMessagesArea';

// Mesmo mock do ChatMessagesArea.loop.test.tsx: disparo assincrono do callback
// (setTimeout 0) para nao recursar dentro da re-observacao do virtual-core.
// Altura 120 e diferente do estimateSize (100) do componente: forca a correcao
// estimate -> real logo depois do prepend, que e onde a ancora costuma pular.
const ALTURA_ITEM = 120;
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
              height: ALTURA_ITEM, width: 800, top: 0, left: 0,
              bottom: ALTURA_ITEM, right: 800, x: 0, y: 0, toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ blockSize: ALTURA_ITEM, inlineSize: 800 }],
            contentBoxSize: [{ blockSize: ALTURA_ITEM, inlineSize: 800 }],
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

let getBCRSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 600, configurable: true });
  // TanStack Virtual chama getBoundingClientRect() no scroll element para medir
  // a altura do container; jsdom retorna 0 por padrão, impedindo a renderização.
  getBCRSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 600, width: 800, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterAll(() => {
  getBCRSpy.mockRestore();
});

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string } }) => (
    <div data-testid="bubble" data-message-id={message.id} style={{ height: ALTURA_ITEM }} />
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

const MESMO_TIMESTAMP = new Date('2026-09-02T12:00:00Z');

function makeMessage(id: string): Message {
  return {
    id,
    content: `mensagem ${id}`,
    sender: 'contact',
    senderName: 'Contato',
    timestamp: MESMO_TIMESTAMP,
    status: 'delivered',
    type: 'text',
  } as unknown as Message;
}

type AreaProps = ComponentProps<typeof ChatMessagesArea>;

function makeProps(messages: Message[], extra: Partial<AreaProps> = {}): AreaProps {
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
    ...extra,
  };
}

function renderArea(props: AreaProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (p: AreaProps) => (
    <QueryClientProvider client={queryClient}>
      <div style={{ height: 600, overflowY: 'auto' }}>
        <ChatMessagesArea {...p} />
      </div>