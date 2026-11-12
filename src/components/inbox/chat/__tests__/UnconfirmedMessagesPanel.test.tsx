import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Painel C110: só renderiza com mensagens ambíguas; botões só para admin/supervisor.
const hook = vi.hoisted(() => ({
  value: {
    messages: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    resolve: vi.fn(),
    isResolving: false,
    resolvingId: null as string | null,
  },
}));
const role = vi.hoisted(() => ({ value: { isAdmin: false, isSupervisor: false } }));

vi.mock('@/hooks/delivery/useUnconfirmedMessages', () => ({
  useUnconfirmedMessages: () => hook.value,
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => role.value }));

import { UnconfirmedMessagesPanel } from '../UnconfirmedMessagesPanel';

const MSG = {
  id: 'm1', content: 'Proposta enviada', created_at: '2026-11-11T12:00:00Z',
  delivery_post_started_at: '2026-11-11T12:00:00Z', status: 'sending', contact_id: 'c1', agent_id: 'a1',
};

beforeEach(() => {
  hook.value = { messages: [], isLoading: false, isError: false, resolve: vi.fn(), isResolving: false, resolvingId: null };
  role.value = { isAdmin: false, isSupervisor: false };
});

describe('UnconfirmedMessagesPanel', () => {
  it('sem mensagens não renderiza nada', () => {
    const { container } = render(<UnconfirmedMessagesPanel contactId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('em erro não renderiza nada', () => {
    hook.value = { ...hook.value, messages: [MSG], isError: true };
    const { container } = render(<UnconfirmedMessagesPanel contactId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('agente vê o aviso, mas NÃO os botões de correção', () => {
    hook.value = { ...hook.value, messages: [MSG] };
    render(<UnconfirmedMessagesPanel contactId="c1" />);
    expect(screen.getByRole('region', { name: 'Mensagens com entrega não confirmada' })).toBeInTheDocument();
    expect(screen.getByText('1 mensagem com entrega não confirmada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /como entregue/ })).toBeNull();
  });

  it('supervisor resolve como entregue e como não entregue', () => {
    role.value = { isAdmin: false, isSupervisor: true };
    hook.value = { ...hook.value, messages: [MSG] };
    render(<UnconfirmedMessagesPanel contactId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: /como entregue$/ }));
    fireEvent.click(screen.getByRole('button', { name: /como não entregue$/ }));
    expect(hook.value.resolve).toHaveBeenNthCalledWith(1, { messageId: 'm1', outcome: 'sent' });
    expect(hook.value.resolve).toHaveBeenNthCalledWith(2, { messageId: 'm1', outcome: 'not_delivered' });
  });

  it('enquanto resolve a mensagem, troca os botões dela pelo spinner', () => {
    role.value = { isAdmin: true, isSupervisor: false };
    hook.value = { ...hook.value, messages: [MSG], isResolving: true, resolvingId: 'm1' };
    render(<UnconfirmedMessagesPanel contactId="c1" />);
    expect(screen.queryByRole('button', { name: /como entregue$/ })).toBeNull();
  });
});
