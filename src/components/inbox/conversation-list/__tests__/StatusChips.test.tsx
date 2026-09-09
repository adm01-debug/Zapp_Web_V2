import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { buildConversationListEntries } from '../groupConversations';
import { StatusChips } from '../StatusChips';

function conversation(
  id: string,
  options: {
    assignedTo?: string | null;
    status?: 'open' | 'waiting' | 'resolved' | 'archived';
    unread?: number;
    timestamp?: string;
  } = {},
): ConversationWithMessages {
  const timestamp = options.timestamp ?? '2026-09-09T15:30:00.000Z';
  return {
    contact: {
      id,
      name: `Contato ${id}`,
      phone: `551199999${id}`,
      assigned_to: options.assignedTo ?? null,
      conversation_status: options.status ?? 'open',
      created_at: timestamp,
      updated_at: timestamp,
    },
    messages: options.status === 'resolved' || options.status === 'archived'
      ? []
      : [{ id: `message-${id}`, content: 'Olá', sender: 'contact', created_at: timestamp }],
    unreadCount: options.unread ?? 0,
    lastMessage: { id: `message-${id}`, content: 'Olá', sender: 'contact', created_at: timestamp },
  } as unknown as ConversationWithMessages;
}

describe('StatusChips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T18:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('calcula contagens por estado sem inventar dados', () => {
    render(
      <StatusChips
        conversations={[
          conversation('1', { assignedTo: 'agent-1', unread: 2 }),
          conversation('2', { status: 'waiting' }),
          conversation('3', { status: 'resolved' }),
          conversation('4', { status: 'archived' }),
        ]}
        chipTab="all"
        onChipTabChange={vi.fn()}
        profileId="agent-1"
      />,
    );

    expect(screen.getByTestId('status-chip-all')).toHaveTextContent('Todas2');
    expect(screen.getByTestId('status-chip-unread')).toHaveTextContent('Não lidas1');
    expect(screen.getByTestId('status-chip-attending')).toHaveTextContent('Em atendimento1');
    expect(screen.getByTestId('status-chip-waiting')).toHaveTextContent('Aguardando1');
    expect(screen.getByTestId('status-chip-resolved')).toHaveTextContent('Resolvidas2');
    expect(screen.getByTestId('status-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('troca o filtro pelo botão selecionado', () => {
    const onChange = vi.fn();
    render(
      <StatusChips
        conversations={[conversation('1')]}
        chipTab="all"
        onChipTabChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('status-chip-unread'));
    expect(onChange).toHaveBeenCalledWith('unread');
  });
});

describe('buildConversationListEntries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T18:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('prioriza fixadas e agrupa o restante por data real', () => {
    const entries = buildConversationListEntries([
      conversation('today', { timestamp: '2026-09-09T15:30:00.000Z' }),
      conversation('yesterday', { timestamp: '2026-09-08T15:30:00.000Z' }),
      conversation('old', { timestamp: '2026-08-01T15:30:00.000Z' }),
      conversation('pinned', { timestamp: '2026-07-01T15:30:00.000Z' }),
    ], new Set(['pinned']));

    expect(entries.filter((entry) => entry.kind === 'header').map((entry) => entry.title))
      .toEqual(['Fixadas', 'Hoje', 'Ontem', 'Mais antigas']);
    expect(entries.filter((entry) => entry.kind === 'conversation').map((entry) => entry.conversation.contact.id))
      .toEqual(['pinned', 'today', 'yesterday', 'old']);
  });
});
