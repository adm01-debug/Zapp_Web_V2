import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatSearchBar } from '../ChatSearchBar';
import { ChatSearchResultsList } from '../ChatSearchResultsList';
import { Message } from '@/types/chat';

// `useReducedMotion` é trocável por teste; o resto do framer-motion fica real.
const motionState = vi.hoisted(() => ({ reduzido: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const atual = await importOriginal<typeof import('framer-motion')>();
  return { ...atual, useReducedMotion: () => motionState.reduzido };
});

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    sender: 'contact',
    content: '',
    timestamp: new Date('2026-04-08T10:00:00Z'),
    status: 'delivered',
    type: 'text',
    ...overrides,
  } as Message;
}

// 7 mensagens contendo "teste" → mais de 5 resultados no preview.
const MANY_TESTS: Message[] = Array.from({ length: 7 }, (_, i) =>
  makeMsg({ id: `t${i}`, content: `mensagem de teste numero ${i}` })
);

const NO_MATCH: Message[] = [makeMsg({ id: '1', content: 'bom dia' })];

describe('ChatSearchBar — aviso de resultados', () => {
  let onClose: Mock<() => void>;
  let onNavigateToMessage: Mock<(messageId: string) => void>;
  let onHighlightChange: Mock<(messageIds: Set<string>, activeId: string | null) => void>;

  beforeEach(() => {
    onClose = vi.fn();
    onNavigateToMessage = vi.fn();
    onHighlightChange = vi.fn();
    motionState.reduzido = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderBar = (msgs: Message[]) =>
    render(
      <ChatSearchBar
        messages={msgs}
        isOpen
        onClose={onClose}
        onNavigateToMessage={onNavigateToMessage}
        onHighlightChange={onHighlightChange}
      />
    );

  const type = async (value: string) => {
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value } });
    await act(async () => { vi.advanceTimersByTime(250); });
  };

  it('busca sem resultado mostra "Nenhum resultado para esta busca." uma única vez', async () => {
    renderBar(NO_MATCH);
    await type('zzznaoencontrado');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Nenhum resultado para esta busca.');
    expect(screen.getAllByText('Nenhum resultado para esta busca.')).toHaveLength(1);
  });

  it('sem resultado e com texto vazio a lista não mostra o aviso de vazio', () => {
    const { container } = render(
      <ChatSearchResultsList results={[]} activeIndex={0} debouncedQuery="" onSelect={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Nenhum resultado para esta busca.')).not.toBeInTheDocument();
  });

  it('o estado vazio traz a microcopy com o termo e o botão de limpar', async () => {
    renderBar(NO_MATCH);
    await type('zzznaoencontrado');

    expect(screen.getByText(/Nada encontrado para “zzznaoencontrado”\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
  });

  it('com mais de 5 resultados avisa quantos sobraram e as teclas de navegação', async () => {
    renderBar(MANY_TESTS);
    await type('teste');

    expect(screen.getByText('+2 resultados. Use Enter e Shift+Enter para navegar.')).toBeInTheDocument();
  });

  it('os botões de navegação anunciam a tecla no rótulo e no title', async () => {
    renderBar(MANY_TESTS);
    await type('teste');

    const next = screen.getByLabelText('Próximo resultado (Enter)');
    const prev = screen.getByLabelText('Resultado anterior (Shift+Enter)');
    expect(next).toHaveAttribute('title', 'Próximo resultado (Enter)');
    expect(prev).toHaveAttribute('title', 'Resultado anterior (Shift+Enter)');
  });

  it('Enter avança e Shift+Enter volta o resultado ativo', async () => {
    renderBar(MANY_TESTS);
    await type('teste');
    const input = screen.getByPlaceholderText('Buscar na conversa...');

    onNavigateToMessage.mockClear();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigateToMessage).toHaveBeenLastCalledWith('t1');

    onNavigateToMessage.mockClear();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onNavigateToMessage).toHaveBeenLastCalledWith('t0');
  });

  it('"Limpar filtros" zera a busca e o aviso de vazio some', async () => {
    renderBar(NO_MATCH);
    await type('zzznaoencontrado');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.getByPlaceholderText('Buscar na conversa...')).toHaveValue('');
    expect(screen.queryByText('Nenhum resultado para esta busca.')).not.toBeInTheDocument();
  });

  it('o aviso "+N" é um botão que expande e mostra todos os itens', async () => {
    renderBar(MANY_TESTS);
    await type('teste');

    expect(screen.getAllByTestId('chat-search-item')).toHaveLength(5);

    const toggle = screen.getByTestId('chat-search-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('chat-search-item')).toHaveLength(7);
    expect(screen.getByTestId('chat-search-expanded')).toBeInTheDocument();
  });

  it('com movimento reduzido nada se desloca (sem translate/height)', async () => {
    motionState.reduzido = true;
    renderBar(MANY_TESTS);
    await type('teste');

    fireEvent.click(screen.getByTestId('chat-search-toggle'));
    const expandido = screen.getByTestId('chat-search-expanded');
    expect(expandido.getAttribute('style') ?? '').not.toMatch(/translate|height/);

    // estado vazio: a lupa também não desloca
    render(
      <ChatSearchResultsList results={[]} activeIndex={0} debouncedQuery="zzz" onSelect={() => {}} />
    );
    const vazio = screen.getAllByTestId('chat-search-empty')[0];
    expect(vazio).toHaveAttribute('data-reduced-motion', 'true');
    const lupa = screen.getAllByTestId('chat-search-empty-lupa')[0];
    expect(lupa.getAttribute('style') ?? '').not.toMatch(/translate/);
  });
});
