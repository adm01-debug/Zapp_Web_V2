/**
 * PK-14 — o callback de busca do chat precisa ser lido na hora em que o debounce
 * dispara, não na hora em que a query mudou.
 *
 * O timer de 200 ms do debounce guarda a closure do render em que `query` mudou.
 * Se o pai troca `onSearchQueryChange` no meio (o ChatPanel troca `setSearchQuery`
 * a cada render), o timer chamava a versão ANTIGA — e a sincronização com o pai
 * ia para o callback errado. Agora o hook guarda o callback num ref lido na
 * hora do disparo, como já fazia com onHighlightChange/onNavigateToMessage.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSearch } from '../chat/useChatSearch';
import { Message } from '@/types/chat';

const makeMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: crypto.randomUUID(),
  conversationId: 'conv-1',
  content: 'mensagem padrão',
  sender: 'contact' as const,
  senderName: 'João',
  timestamp: new Date('2026-04-08T10:00:00'),
  type: 'text',
  status: 'delivered',
  is_deleted: false,
  ...overrides,
} as Message);

const MESSAGES: Message[] = [
  makeMockMessage({ id: 'm1', content: 'Segue a foto da bolsa' }),
  makeMockMessage({ id: 'm2', content: 'Outra mensagem' }),
];

const noop = () => {};

describe('useChatSearch — callback do pai lido no disparo (PK-14)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa o callback ATUAL quando o pai troca o prop durante o debounce', () => {
    vi.useFakeTimers();
    const antigo = vi.fn();
    const novo = vi.fn();

    const { result, rerender } = renderHook(
      ({ onChange }: { onChange: (q: string) => void }) =>
        useChatSearch({ messages: MESSAGES, isOpen: true, onHighlightChange: noop, onNavigateToMessage: noop, onSearchQueryChange: onChange }),
      { initialProps: { onChange: antigo } },
    );

    act(() => result.current.setQuery('bolsa'));
    // O pai troca o callback ANTES dos 200 ms do debounce.
    rerender({ onChange: novo });
    act(() => vi.advanceTimersByTime(250));

    expect(novo).toHaveBeenCalledWith('bolsa');
    expect(antigo).not.toHaveBeenCalledWith('bolsa');
  });

  it('mantém o debounce: o callback só dispara depois da pausa', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useChatSearch({ messages: MESSAGES, isOpen: true, onHighlightChange: noop, onNavigateToMessage: noop, onSearchQueryChange: onChange }),
    );

    act(() => result.current.setQuery('bolsa'));
    act(() => vi.advanceTimersByTime(50));
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('bolsa');
  });

  it('ao fechar, limpa o callback pela versão atual do ref', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useChatSearch({ messages: MESSAGES, isOpen, onHighlightChange: noop, onNavigateToMessage: noop, onSearchQueryChange: onChange }),
      { initialProps: { isOpen: true } },
    );

    rerender({ isOpen: false });
    act(() => vi.advanceTimersByTime(250));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
