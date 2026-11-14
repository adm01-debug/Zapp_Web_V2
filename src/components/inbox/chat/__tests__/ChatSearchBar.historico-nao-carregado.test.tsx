import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatSearchBar } from '../ChatSearchBar';
import { Message } from '@/types/chat';

/**
 * Bug: `useChatSearch` filtra só sobre `messages` (a página já carregada, 100 por vez —
 * `useMessages.ts`), nunca chama `onLoadOlderMessages`. Quando o termo só existe numa
 * mensagem antiga ainda não carregada, o estado vazio dizia "Nenhum resultado para esta
 * busca.", implicando que a conversa inteira foi varrida — falso. Com `hasOlderMessages`
 * true o aviso precisa deixar claro que a busca cobre só o que já foi carregado.
 */

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

const NO_MATCH: Message[] = [makeMsg({ id: '1', content: 'bom dia' })];

describe('ChatSearchBar — honestidade do estado vazio com histórico não carregado', () => {
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

  const type = async (value: string) => {
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value } });
    await act(async () => { vi.advanceTimersByTime(250); });
  };

  it('com hasOlderMessages=true, busca sem resultado avisa que a cobertura é só o carregado', async () => {
    render(
      <ChatSearchBar
        messages={NO_MATCH}
        isOpen
        onClose={onClose}
        onNavigateToMessage={onNavigateToMessage}
        onHighlightChange={onHighlightChange}
        hasOlderMessages
      />
    );
    await type('zzznaoencontrado');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Sem resultado nas mensagens carregadas.');
    // NUNCA deve implicar que a conversa inteira foi varrida.
    expect(status).not.toHaveTextContent('Nenhum resultado para esta busca.');
    expect(status).toHaveTextContent(/role até o topo/i);
    expect(status).toHaveTextContent(/carregar mensagens mais antigas/i);
  });

  it('sem hasOlderMessages (tudo carregado), mantém o aviso genérico de sempre', async () => {
    render(
      <ChatSearchBar
        messages={NO_MATCH}
        isOpen
        onClose={onClose}
        onNavigateToMessage={onNavigateToMessage}
        onHighlightChange={onHighlightChange}
        hasOlderMessages={false}
      />
    );
    await type('zzznaoencontrado');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Nenhum resultado para esta busca.');
    expect(status).not.toHaveTextContent('Sem resultado nas mensagens carregadas.');
  });
});
