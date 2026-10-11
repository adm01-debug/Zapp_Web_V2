import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatSearchBar } from '../ChatSearchBar';
import { ChatSearchResultsList } from '../ChatSearchResultsList';
import { Message } from '@/types/chat';

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
});
