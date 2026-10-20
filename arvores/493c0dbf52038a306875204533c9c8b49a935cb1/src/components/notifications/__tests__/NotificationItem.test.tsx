/**
 * Fase F (etapa 69): o item da lista do popover.
 * `reminder_due` → as 3 ações do alarme; `info` → linha inalterada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockOpenTask = vi.fn();
const mockSnooze = vi.fn();
const mockComplete = vi.fn();

vi.mock('@/hooks/tasks/useWorkItemNotifications', () => ({
  useWorkItemNotifications: () => ({
    taskId: 'task-1',
    contactId: 'contact-1',
    openTask: mockOpenTask,
    openContact: vi.fn(),
    snooze: mockSnooze,
    complete: mockComplete,
    markAsRead: vi.fn(),
    isPending: false,
  }),
}));

import { NotificationItem } from '@/components/notifications/NotificationItem';
import type { Notification } from '@/hooks/system/useNotifications';

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    user_id: 'u1',
    title: 'Tarefa: ligar para o cliente',
    message: 'O alarme deste lembrete venceu',
    type: 'reminder_due',
    is_read: false,
    metadata: { task_id: 'task-1', contact_id: 'contact-1', contact_name: 'Maria' },
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockOpenTask.mockClear();
  mockSnooze.mockClear();
  mockComplete.mockClear();
});

describe('NotificationItem — reminder_due', () => {
  it('renderiza as 3 ações do aviso (Abrir · Adiar · Concluir)', () => {
    render(<NotificationItem notification={notification()} />);

    expect(screen.getByRole('button', { name: /abrir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adiar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /concluir/i })).toBeInTheDocument();
  });

  it('"Abrir" dispara openTask (o hook é quem grava ?task=<id> e navega)', () => {
    render(<NotificationItem notification={notification()} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir/i }));

    expect(mockOpenTask).toHaveBeenCalledTimes(1);
  });

  it('"Concluir" dispara complete', () => {
    render(<NotificationItem notification={notification()} />);

    fireEvent.click(screen.getByRole('button', { name: /concluir/i }));

    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationItem — outros tipos', () => {
  it('`info` fica inalterado: sem botões de ação', () => {
    render(<NotificationItem notification={notification({ type: 'info', metadata: {} })} />);

    expect(screen.queryByRole('button', { name: /abrir/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /concluir/i })).toBeNull();
    expect(screen.getByText('Tarefa: ligar para o cliente')).toBeInTheDocument();
  });

  it('`info` marca como lida ao clicar na linha', () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={notification({ type: 'info', metadata: {} })} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByText('Tarefa: ligar para o cliente'));

    expect(onMarkRead).toHaveBeenCalledWith('n1');
  });
});
