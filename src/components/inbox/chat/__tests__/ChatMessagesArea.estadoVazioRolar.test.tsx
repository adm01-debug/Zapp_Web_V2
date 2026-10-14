/**
 * Estado vazio da conversa + botao flutuante "Rolar para o final".
 *
 * Prova, com o componente REAL renderizado:
 * 1. conversa sem mensagens mostra "Nenhuma mensagem ainda" + apoio; o botao
 *    "Escrever mensagem" dispara `onEmptyAction` (prop; sem ela e no-op) e
 *    nunca consulta o DOM; a regiao anuncia o vazio no aria-label, o bloco
 *    tem role="status" e o texto secundario usa zinc-300 (#D4D4D8);
 * 2. o estado vazio nao aparece com carga em andamento nem com mensagens;
 * 3. "Rolar para o final" so aparece acima de 300px do fim e some no fim;
 * 4. o clique leva a lista ao fim (o guard de acompanhamento nao o bloqueia);
 * 5. com movimento reduzido nada se desloca (so opacidade);
 * 6. o indicador de digitacao fica FORA do role="log" (posicao de leitura).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { Message } from '@/types/chat';
import { ChatMessagesArea } from '../ChatMessagesArea';

const estado = vi.hoisted(() => ({ reduzido: false }));

// Mock do framer-motion: troca os elementos animados por tags reais que expõem
// os props de animação em data-attributes — é o que deixa afirmar o que a tela
// pede sem depender de rAF em jsdom.
vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  type Props = Record<string, unknown>;
  const cache = new Map<string, (p: Props) => ReactNode>();
  const embrulhar = (tag: string) => {
    if (!cache.has(tag)) {
      cache.set(tag, (props: Props) => {
        const { initial, animate, exit, transition, children, ...resto } = props;
        return createElement(
          tag,
          {
            ...resto,
            'data-motion-inicial': JSON.stringify(initial ?? null),
            'data-motion-animado': JSON.stringify(animate ?? null),
            'data-motion-transicao': JSON.stringify(transition ?? null),
            'data-motion-saida': JSON.stringify(exit ?? null),
          },
          children as ReactNode,
        );
      });
    }
    return cache.get(tag)!;
  };
  const motion = new Proxy({}, {
    get: (_alvo, tag: string | symbol) => (typeof tag === 'string' ? embrulhar(tag) : undefined),
  });
  const AnimatePresence = ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'animate-presence' }, children);
  return { ...real, motion, AnimatePresence, useReducedMotion: () => estado.reduzido };
});

class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    setTimeout(() => {
      this.cb(
        [{
          target,
          contentRect: { height: 120, width: 800, top: 0, left: 0, bottom: 120, right: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
          borderBoxSize: [{ blockSize: 120, inlineSize: 800 }],
          contentBoxSize: [{ blockSize: 120, inlineSize: 800 }],
          devicePixelContentBoxSize: [],
        }],
        this as unknown as ResizeObserver,
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
  MessageBubble: () => createElement('div', { 'data-testid': 'bubble', style: { height: 120 } }),
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

afterEach(() => {
  estado.reduzido = false;
  cleanup();
});

function makeMessage(id: string): Message {
  return {
    id,
    content: `mensagem ${id}`,
    sender: 'contact',
    senderName: 'Contato',
    timestamp: new Date('2026-09-02T12:00:00Z'),
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
  return { ...view, rerenderArea: (p: AreaProps) => view.rerender(wrap(p)) };
}

/** Alturas do viewport de rolagem em jsdom (sem layout real) + leitura/escrita
 *  de scrollTop controlada, para montar a distancia ate o fim. */
function simularScroll(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  let scrollTop = 0;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => { scrollTop = v; },
  });
  // jsdom nao implementa scrollTo; sem isso o virtualizer nao teria para onde
  // rolar e o scrollTop ficaria intacto.
  const scrollTo = vi.fn((alvo?: number | { top?: number }) => {
    if (typeof alvo === 'number') scrollTop = alvo;
    else if (alvo && typeof alvo.top === 'number') scrollTop = alvo.top;
  });
  Object.defineProperty(el, 'scrollTo', { configurable: true, value: scrollTo });
  return {
    irPara: (v: number) => { scrollTop = v; fireEvent.scroll(el); },
    scrollTo,
    get scrollTop() { return scrollTop; },
  };
}

const botaoRolar = () => screen.queryByRole('button', { name: 'Rolar para o final' });

describe('ChatMessagesArea — estado vazio da conversa', () => {
  it('sem mensagens mostra o estado vazio com CTA "Escrever mensagem"', () => {
    renderArea(makeProps([]));

    const vazio = screen.getByTestId('chat-empty-state');
    expect(vazio).toHaveTextContent('Nenhuma mensagem ainda');
    expect(vazio).toHaveTextContent('Envie a primeira mensagem para começar.');
    expect(screen.getByRole('button', { name: 'Escrever mensagem' })).toBeInTheDocument();
  });

  it('CTA do estado vazio dispara onEmptyAction sem consultar o DOM', () => {
    const qsSpy = vi.spyOn(document, 'querySelector');
    const onEmptyAction = vi.fn();
    renderArea(makeProps([], { onEmptyAction }));

    fireEvent.click(screen.getByRole('button', { name: 'Escrever mensagem' }));

    expect(onEmptyAction).toHaveBeenCalledTimes(1);
    expect(qsSpy).not.toHaveBeenCalled();
    qsSpy.mockRestore();
  });

  it('CTA do estado vazio sem onEmptyAction e no-op silencioso (nao lanca)', () => {
    renderArea(makeProps([]));
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Escrever mensagem' })),
    ).not.toThrow();
  });

  it('regiao do log anuncia o vazio no proprio aria-label (derivado, sem prop nova)', () => {
    renderArea(makeProps([]));
    expect(screen.getByRole('log')).toHaveAttribute(
      'aria-label',
      'Mensagens da conversa, nenhuma mensagem ainda',
    );
  });

  it('regiao do log mantem o rotulo padrao quando ha mensagens', () => {
    renderArea(makeProps([makeMessage('msg-1')]));
    expect(screen.getByRole('log')).toHaveAttribute('aria-label', 'Mensagens da conversa');
  });

  it('bloco vazio tem role="status" e mantem o data-testid', () => {
    renderArea(makeProps([]));
    expect(screen.getByTestId('chat-empty-state')).toHaveAttribute('role', 'status');
  });

  it('texto secundario do vazio usa zinc-300 (#D4D4D8, contraste AA no fundo escuro)', () => {
    renderArea(makeProps([]));
    expect(screen.getByText('Envie a primeira mensagem para começar.').className)
      .toContain('text-zinc-300');
  });

  it('indicador de digitacao fica FORA do role="log" (posicao de leitura)', () => {
    const { container } = renderArea(makeProps([makeMessage('msg-1')], { isContactTyping: true }));
    const digitando = screen.getByText('Contato está digitando');
    expect(screen.getByRole('log').contains(digitando)).toBe(false);
    expect(container.contains(digitando)).toBe(true);
  });

  it('nao mostra o estado vazio enquanto carrega nem quando ha mensagens', () => {
    const { rerenderArea } = renderArea(makeProps([], { isLoading: true }));
    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();

    // mesma lista, sem carga: o estado vazio aparece.
    rerenderArea(makeProps([]));
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

    rerenderArea(makeProps([makeMessage('msg-1')]));
    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma mensagem ainda')).not.toBeInTheDocument();
  });

  it('com movimento reduzido o estado vazio nao desloca (so opacidade)', () => {
    estado.reduzido = true;
    renderArea(makeProps([]));

    const animado = screen.getByTestId('chat-empty-state').querySelector<HTMLElement>('[data-motion-inicial]');
    expect(animado).not.toBeNull();
    const inicial = JSON.parse(animado!.getAttribute('data-motion-inicial') ?? 'null') as Record<string, unknown>;
    expect(inicial).not.toHaveProperty('y');
    expect(animado!.getAttribute('data-motion-transicao')).toContain('"duration":0');
  });
});

describe('ChatMessagesArea — botão "Rolar para o final"', () => {
  it('aparece só acima de 300px do fim e some ao voltar para o fim', async () => {
    renderArea(makeProps([makeMessage('msg-1'), makeMessage('msg-2'), makeMessage('msg-3')]));
    const scroll = screen.getByRole('log');
    const rolagem = simularScroll(scroll, 1200, 400);

    // Fim da lista: nada a rolar.
    rolagem.irPara(800);
    expect(botaoRolar()).not.toBeInTheDocument();

    // 300px do fim: ainda no limite, o botao nao aparece.
    rolagem.irPara(500);
    expect(botaoRolar()).not.toBeInTheDocument();

    // 800px do fim: o usuario esta lendo o historico.
    rolagem.irPara(0);
    expect(botaoRolar()).toBeInTheDocument();

    // De volta ao fim.
    rolagem.irPara(800);
    expect(botaoRolar()).not.toBeInTheDocument();
  });

  it('o clique leva a lista ao fim e o botao some', async () => {
    renderArea(makeProps([makeMessage('msg-1'), makeMessage('msg-2'), makeMessage('msg-3')]));
    const scroll = screen.getByRole('log');
    const rolagem = simularScroll(scroll, 1200, 400);

    rolagem.irPara(0);
    const botao = botaoRolar();
    expect(botao).toBeInTheDocument();

    fireEvent.click(botao!);

    // O guard de acompanhamento nao bloqueia a acao explicita do usuario.
    expect(rolagem.scrollTop).toBeGreaterThan(0);
    expect(botaoRolar()).not.toBeInTheDocument();
  });

  it('mostra o selo com as mensagens que chegaram depois de rolar para cima', async () => {
    const iniciais = [makeMessage('msg-1'), makeMessage('msg-2'), makeMessage('msg-3')];
    const { rerenderArea } = renderArea(makeProps(iniciais));
    const scroll = screen.getByRole('log');
    const rolagem = simularScroll(scroll, 1200, 400);

    rolagem.irPara(0);
    expect(botaoRolar()).toBeInTheDocument();
    expect(screen.queryByTestId('scroll-to-bottom-badge')).not.toBeInTheDocument();

    rerenderArea(makeProps([...iniciais, makeMessage('msg-4'), makeMessage('msg-5')]));

    expect(screen.getByTestId('scroll-to-bottom-badge')).toHaveTextContent('2');
  });

  it('com movimento reduzido o botao entra sem deslocamento', async () => {
    estado.reduzido = true;
    renderArea(makeProps([makeMessage('msg-1'), makeMessage('msg-2'), makeMessage('msg-3')]));
    const scroll = screen.getByRole('log');
    const rolagem = simularScroll(scroll, 1200, 400);

    rolagem.irPara(0);

    const embrulho = screen.getByTestId('scroll-to-bottom-wrap');
    const inicial = JSON.parse(embrulho.getAttribute('data-motion-inicial') ?? 'null') as Record<string, unknown>;
    expect(inicial).not.toHaveProperty('y');
    expect(embrulho.getAttribute('data-motion-transicao')).toContain('"duration":0');
  });
});
