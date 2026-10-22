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
import { describe, it, expect, vi, beforeAll } from 'vitest';
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

beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
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
    </QueryClientProvider>
  );
  const view = render(wrap(props));
  return {
    ...view,
    rerenderArea: (p: AreaProps) => view.rerender(wrap(p)),
  };
}

/** Elemento rolavel da area de mensagens (o proprio role="log"). */
function scrollSurface(): HTMLElement {
  return screen.getByRole('log');
}

/** Posicao (start, em px) do item virtualizado no indice informado. */
function itemStart(index: number): number {
  const el = scrollSurface().querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!el) throw new Error(`item virtualizado ${index} nao esta renderizado`);
  const match = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
  if (!match) throw new Error(`sem translateY no item ${index}: "${el.style.transform}"`);
  return Number(match[1]);
}

describe('ChatMessagesArea — historico anterior (R2-INB-004)', () => {
  it('mostra o controle acessivel quando ha historico e anuncia o inicio quando ele acaba', async () => {
    const onLoadOlderMessages = vi.fn();
    const messages = [makeMessage('msg-1'), makeMessage('msg-2')];

    const { rerenderArea } = renderArea(makeProps(messages, { hasOlderMessages: true, onLoadOlderMessages }));

    const button = screen.getByRole('button', { name: /carregar mensagens anteriores/i });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByTestId('history-start')).not.toBeInTheDocument();

    // "Fim do historico" apos a carga: o controle sai e o inicio fica anunciado.
    rerenderArea(makeProps(messages, { hasOlderMessages: false, onLoadOlderMessages }));

    expect(screen.queryByRole('button', { name: /carregar mensagens anteriores/i })).not.toBeInTheDocument();
    const inicio = screen.getByTestId('history-start');
    expect(inicio).toHaveTextContent(/in[ií]cio do hist[óo]rico/i);
    expect(inicio).toHaveAttribute('role', 'status');
  });

  it('nao renderiza controle nenhum quando o consumidor nao informa o historico', async () => {
    renderArea(makeProps([makeMessage('msg-1')]));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble').length).toBeGreaterThan(0);
    });

    expect(screen.queryByTestId('load-older-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('history-start')).not.toBeInTheDocument();
  });

  it('um clique dispara uma unica chamada e o carregamento bloqueia disparo concorrente', async () => {
    let liberar: () => void = () => {};
    const onLoadOlderMessages = vi.fn(
      () => new Promise<void>((resolve) => { liberar = resolve; }),
    );
    const messages = [makeMessage('msg-1'), makeMessage('msg-2')];

    renderArea(makeProps(messages, { hasOlderMessages: true, onLoadOlderMessages }));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(messages.length);
    });

    const button = screen.getByTestId('load-older-button');
    fireEvent.click(button);

    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('older-loading-status')).toHaveTextContent(/carregando mensagens anteriores/i);

    // Clique repetido durante a promessa nao pode disparar outra busca.
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);

    await act(async () => { liberar(); });

    expect(button).toBeEnabled();
    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('prepend do lote antigo preserva a mensagem-ancora no mesmo lugar do viewport', async () => {
    let liberar: () => void = () => {};
    const onLoadOlderMessages = vi.fn(
      () => new Promise<void>((resolve) => { liberar = resolve; }),
    );

    const iniciais = [makeMessage('msg-1'), makeMessage('msg-2'), makeMessage('msg-3')];
    const { rerenderArea } = renderArea(makeProps(iniciais, { hasOlderMessages: true, onLoadOlderMessages }));

    await waitFor(() => {
      expect(screen.getAllByTestId('bubble')).toHaveLength(iniciais.length);
    });

    const scroll = scrollSurface();
    scroll.scrollTop = 0;

    // Antes do prepend: msg-1 esta no indice 0, no topo do viewport.
    const deslocamentoAntes = itemStart(0) - scroll.scrollTop;

    fireEvent.click(screen.getByTestId('load-older-button'));

    // O lote antigo entra por cima: msg-1 passa para o indice 2.
    const comHistorico = [makeMessage('msg-0a'), makeMessage('msg-0b'), ...iniciais];
    rerenderArea(makeProps(comHistorico, { hasOlderMessages: true, onLoadOlderMessages }));

    // Espera as alturas REAIS dos itens novos (120, nao os 100 estimados).
    await waitFor(() => {
      expect(itemStart(2)).toBeGreaterThan(0);
    });

    // A mensagem-ancora continua exatamente na mesma distancia do topo.
    expect(itemStart(2) - scroll.scrollTop).toBeCloseTo(deslocamentoAntes, 0);
    expect(scroll.scrollTop).toBeGreaterThan(0);

    // Fechar a promessa nao pode reposicionar nada depois.
    await act(async () => { liberar(); });
    expect(itemStart(2) - scroll.scrollTop).toBeCloseTo(deslocamentoAntes, 0);
  });
});
