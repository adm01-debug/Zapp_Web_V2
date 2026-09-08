import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksTab } from '../TasksTab';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';

const mockUseAuth = vi.fn();
const mockUseConversationTasks = vi.fn();
const mockUseTeamProfiles = vi.fn();
const mockToggleTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockCreateTask = vi.fn();

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: (...args: unknown[]) => mockUseAuth(...args) }));
vi.mock('@/hooks/chat/useConversationTasks', () => ({ useConversationTasks: (...args: unknown[]) => mockUseConversationTasks(...args) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: (...args: unknown[]) => mockUseTeamProfiles(...args) }));

function task(overrides: Partial<ConversationTask>): ConversationTask {
  return {
    id: 't1', contact_id: 'c1', title: 'Tarefa', description: null, priority: 'medium', status: 'pending',
    due_date: null, assigned_to: null, created_by: null, completed_at: null,
    created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...overrides,
  };
}

function renderTab(overrides: Partial<{ overdue: ConversationTask[]; today: ConversationTask[]; upcoming: ConversationTask[]; completed7d: ConversationTask[] }> = {}) {
  mockUseAuth.mockReturnValue({ profile: { id: 'me' } });
  mockUseTeamProfiles.mockReturnValue({ data: [{ id: 'me', name: 'Agente Teste' }] });
  mockUseConversationTasks.mockReturnValue({
    overdue: overrides.overdue ?? [], today: overrides.today ?? [], upcoming: overrides.upcoming ?? [], completed7d: overrides.completed7d ?? [],
    toggleTask: mockToggleTask, deleteTask: mockDeleteTask, createTask: mockCreateTask,
  });
  return render(<TasksTab contactId="c1" />);
}

describe('TasksTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os KPIs batendo com o hook', () => {
    renderTab({ overdue: [task({ id: 'a' })], today: [task({ id: 'b' }), task({ id: 'c' })], completed7d: [task({ id: 'd', status: 'completed' })] });
    const strip = screen.getByTestId('kpi-strip');
    expect(strip).toHaveTextContent('1');
    expect(strip).toHaveTextContent('2');
  });

  it('colunas vazias mostram o empty state honesto', () => {
    renderTab();
    expect(screen.getByText('Nenhuma tarefa para hoje')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma tarefa futura')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma tarefa concluída nos últimos 7 dias')).toBeInTheDocument();
  });

  it('tarefas atrasadas e de hoje aparecem juntas na coluna Hoje', () => {
    renderTab({ overdue: [task({ id: 'a', title: 'Atrasada' })], today: [task({ id: 'b', title: 'De hoje' })] });
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
    expect(screen.getByText('De hoje')).toBeInTheDocument();
  });

  it('marcar o checkbox de uma tarefa chama toggleTask', () => {
    renderTab({ today: [task({ id: 'b', title: 'De hoje' })] });
    fireEvent.click(screen.getByRole('checkbox', { name: /De hoje/ }));
    expect(mockToggleTask).toHaveBeenCalled();
  });

  it('"+ Nova tarefa" cria a tarefa com o título digitado', () => {
    renderTab();
    fireEvent.click(screen.getByText('+ Nova tarefa'));
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Ligar para o cliente' } });
    fireEvent.click(screen.getByText('Salvar'));
    expect(mockCreateTask).toHaveBeenCalledWith({ title: 'Ligar para o cliente', createdBy: 'me', assignedTo: 'me' });
  });
});
