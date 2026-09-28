import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TasksTab } from '../TasksTab';

const mockUseMyWorkItems = vi.fn();
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({ useMyWorkItems: (...a: unknown[]) => mockUseMyWorkItems(...a) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'me', name: 'Agente' } }) }));

const emptyHook = {
  byDue: { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [] },
  create: vi.fn().mockResolvedValue(undefined),
  complete: vi.fn().mockResolvedValue(undefined),
  deleteItem: vi.fn().mockResolvedValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  isLoading: false,
};

describe('TasksTab', () => {
  beforeEach(() => { vi.clearAllMocks(); mockUseMyWorkItems.mockReturnValue(emptyHook); });

  it('renderiza o quick add', () => {
    render(<TasksTab contactId="c1" />);
    expect(screen.getByPlaceholderText(/nova tarefa para este contato/i)).toBeTruthy();
  });

  it('exibe mensagem vazia sem tarefas', () => {
    render(<TasksTab contactId="c1" />);
    expect(screen.getByText(/nenhuma tarefa aberta com este contato/i)).toBeTruthy();
  });

  it('passa o contactId para useMyWorkItems', () => {
    render(<TasksTab contactId="cx123" />);
    expect(mockUseMyWorkItems).toHaveBeenCalledWith({ contactId: 'cx123' });
  });
});
