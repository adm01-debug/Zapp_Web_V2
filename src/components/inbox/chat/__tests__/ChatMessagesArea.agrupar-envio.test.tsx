/**
 * R2-INB (paridade V3): agrupamento por janela de 5 min + envio proprio ao fim.
 *
 * Cobre o consumidor real (ChatMessagesArea):
 *   - mesmo remetente com mais de 5 min entre as mensagens abre um NOVO
 *     cabecalho de grupo (marcador de entrada do grupo animado);
 *   - mesmo remetente dentro da janela continua um unico grupo (sem novo
 *     cabecalho);
 *   - enviar mensagem propria leva a lista ao fim MESMO com o usuario lendo o
 *     historico acima, e acende o selo "Nova mensagem enviada";
 *   - o selo some sozinho ~1 s depois.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message } from '@/types/chat';
import { ChatMessagesArea, type ChatMessagesAreaRef } from '../ChatMessagesArea';

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

// jsdom nao implementa Element.scrollTo; o virtualizer o usa para ir ao fim.
const scrollToSpy = vi.fn();

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollToSpy;
  // jsdom não computa layout: clientHeight/offsetHeight ficam 0 mesmo com style.height.
  // O virtualizer lê clientHeight do container para calcular o range visível; sem isso
  // getVirtualItems() retorna vazio e os testes falham no CI.
  // Nota: testes que redefinem clientHeight por instância (Object.defineProperty no elemento
  // específico) têm prioridade sobre este getter de protótipo — sem conflito.
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get() { return 600; },
  });
  Object.defineProperty(Element.prototype, 'offsetHeight', {
    configurable: true,
    get() { return 600; },
  });
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

function makeMessage(id: string, sender: 'contact' | 'agent', timestamp: Date): Message {
  return {
    id,
    content: `mensagem ${id}`,
    sender,
    senderName: sender === 'agent' ? 'Agente' : 'Contato',
    timestamp,
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

const areaRef: { current: ChatMessagesAreaRef | null } = { current: null };

beforeEach(() => {
  areaRef.current = null;
  scrollToSpy.mockClear();
});

function renderArea(props: AreaProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatMessagesArea ref={(r) => { areaRef.current = r; }} {...props} />
    </QueryClientProvider>,
  );
}

function scrollSurface(): HTMLElement {
  return screen.getByRole('log');
}

const T = (iso: string) => new Date(iso);

describe('ChatMessagesArea — agrupar dentro da janela de 5 min', () => {
  it('mesmo remetente com mais de 5 min abre um novo cabecalho de grupo', async () => {
    renderArea(makeProps([
      makeMessage('msg-1', 'contact', T('2026-10-12T12:00:00Z')),
      makeMessage('msg-2', 'contact', T('2026-10-12T12:06:00Z')),
    ]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    });

    expect(screen.getAllByTestId('group-entry-fade')).toHaveLength(1);
  });

  it('mesmo remetente dentro de 5 min continua um unico grupo (sem novo cabecalho)', async () => {
    renderArea(makeProps([
      makeMessage('msg-1', 'contact', T('2026-10-12T12:00:00Z')),
      makeMessage('msg-2', 'contact', T('2026-10-12T12:02:00Z')),
    ]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    });

    expect(screen.queryByTestId('group-entry-fade')).not.toBeInTheDocument();
  });
});

describe('ChatMessagesArea — envio proprio leva ao fim', () => {
  it('rola ao fim mesmo com o usuario lendo o historico e acende o selo', async () => {
    renderArea(makeProps([
      makeMessage('msg-1', 'contact', T('2026-10-12T12:00:00Z')),
      makeMessage('msg-2', 'agent', T('2026-10-12T12:01:00Z')),
    ]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    });

    const scroll = scrollSurface();
    Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 100, configurable: true });
    scroll.scrollTop = 0;
    // Usuario leu o historico acima: o painel deixa de seguir o fim.
    fireEvent.scroll(scroll);

    scrollToSpy.mockClear();
    act(() => { areaRef.current?.scrollToBottom(); });
    // Chegada de mensagem alheia NAO reposiciona quem esta lendo acima.
    expect(scrollToSpy).not.toHaveBeenCalled();

    act(() => { areaRef.current?.scrollToBottomAfterSend(); });
    // Envio proprio: vai ao fim de qualquer forma.
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sent-badge')).toHaveTextContent(/nova mensagem enviada/i);
  });

  it('o selo some sozinho ~1 s depois de chegar ao fim', async () => {
    renderArea(makeProps([
      makeMessage('msg-1', 'contact', T('2026-10-12T12:00:00Z')),
    ]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(1);
    });

    act(() => { areaRef.current?.scrollToBottomAfterSend(); });
    expect(screen.getByTestId('sent-badge')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('sent-badge')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
