import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksTab } from '../TasksTab';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

const mockUseMyWorkItems = vi.fn();
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({ useMyWorkItems: (...a: unknown[]) => mockUseMyWorkItems(...a) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'me', name: 'Agente' } }) }));

function makeItem(id: string, status: WorkItemStatus, title: string, extra: Partial<WorkItem> = {}): WorkItem {
  return {
    id, title, status,
    description: null, priority: 'medium', due_date: null, remind_at: null, notified_at: null,
    waiting_reason: null, position: 0, started_at: null, status_changed_at: '2026-09-01T00:00:00Z',
    completed_at: status === 'done' ? '2026-09-30T00:00:00Z' : null,
    contact_id: 'c1', created_by: 'me', assigned_to: 'me',
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    contact: null,
    ...extra,
  };
}

type ByStatus = Record<WorkItemStatus, WorkItem[]>;

function makeHook(over: { byStatus?: Partial<ByStatus>; done7d?: WorkItem[] } = {}) {
  const byStatus: ByStatus = { backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [], ...over.byStatus };
  const done7d = over.done7d ?? [];
  return {
    byStatus,
    byDue: { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], done7d, doneOlder: [] },
    items: [],
    kpis: { overdue: 0, dueToday: 0, doingCount: byStatus.doing.length, done7d: done7d.length, avgCycleTimeDays: null },
    create: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  };
}

function renderTab(hook = makeHook(), contactId = 'c1') {
  mockUseMyWorkItems.mockReturnValue(hook);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <TasksTab contactId={contactId} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('TasksTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza o quick add', () => {
    renderTab();
    expect(screen.getByPlaceholderText(/nova tarefa para este contato/i)).toBeTruthy();
  });

  it('exibe mensagem vazia sem tarefas', () => {
    renderTab();
    expect(screen.getByText(/nenhuma tarefa aberta com este contato/i)).toBeTruthy();
  });

  it('passa o contactId para useMyWorkItems', () => {
    renderTab(makeHook(), 'cx123');
    expect(mockUseMyWorkItems).toHaveBeenCalledWith({ contactId: 'cx123' });
  });

  it('desenha o mini-quadro com os 5 grupos por status', () => {
    renderTab(makeHook({
      byStatus: {
        doing: [makeItem('d1', 'doing', 'Fazer relatório')],
        todo: [makeItem('t1', 'todo', 'Preparar proposta')],
        waiting: [makeItem('w1', 'waiting', 'Aguardar boleto')],
        backlog: [makeItem('b1', 'backlog', 'Ideia solta')],
      },
      done7d: [makeItem('done1', 'done', 'Enviar catálogo')],
    }));

    expect(screen.getByTestId('tasks-group-doing')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-group-todo')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-group-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-group-backlog')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-group-done')).toBeInTheDocument();

    expect(screen.getByText('Fazendo')).toBeInTheDocument();
    expect(screen.getByText('A fazer')).toBeInTheDocument();
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('Caixa de entrada')).toBeInTheDocument();
    expect(screen.getByText('Concluídas')).toBeInTheDocument();
  });

  it('mostra o contador de cada grupo', () => {
    renderTab(makeHook({ byStatus: { doing: [makeItem('d1', 'doing', 'A')] } }));

    expect(screen.getByTestId('tasks-group-toggle-doing-count')).toHaveTextContent('1');
    expect(screen.getByTestId('tasks-group-toggle-todo-count')).toHaveTextContent('0');
  });

  it('coloca cada tarefa no grupo do seu status', () => {
    renderTab(makeHook({
      byStatus: {
        doing: [makeItem('d1', 'doing', 'Fazer relatório')],
        todo: [makeItem('t1', 'todo', 'Preparar proposta')],
      },
    }));

    expect(within(screen.getByTestId('tasks-group-doing')).getByText('Fazer relatório')).toBeInTheDocument();
    expect(within(screen.getByTestId('tasks-group-todo')).getByText('Preparar proposta')).toBeInTheDocument();
    expect(within(screen.getByTestId('tasks-group-doing')).queryByText('Preparar proposta')).not.toBeInTheDocument();
  });

  it('colapsa e expande um grupo pelo cabeçalho', () => {
    renderTab(makeHook({ byStatus: { doing: [makeItem('d1', 'doing', 'Fazer relatório')] } }));

    expect(screen.getByText('Fazer relatório')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tasks-group-toggle-doing'));
    expect(screen.queryByText('Fazer relatório')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tasks-group-toggle-doing'));
    expect(screen.getByText('Fazer relatório')).toBeInTheDocument();
  });

  it('mantém as concluídas (7d) colapsadas por padrão', () => {
    renderTab(makeHook({ done7d: [makeItem('done1', 'done', 'Enviar catálogo')] }));

    expect(screen.queryByText('Enviar catálogo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tasks-group-toggle-done'));
    expect(screen.getByText('Enviar catálogo')).toBeInTheDocument();
  });

  it('concluir uma tarefa aberta chama complete', () => {
    const hook = makeHook({ byStatus: { todo: [makeItem('t1', 'todo', 'Preparar proposta')] } });
    renderTab(hook);

    fireEvent.click(within(screen.getByTestId('tasks-group-todo')).getByRole('button', { name: /concluir tarefa/i }));

    expect(hook.complete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('reabrir uma concluída chama move para "todo"', () => {
    const hook = makeHook({ done7d: [makeItem('done1', 'done', 'Enviar catálogo')] });
    renderTab(hook);

    fireEvent.click(screen.getByTestId('tasks-group-toggle-done'));
    fireEvent.click(within(screen.getByTestId('tasks-group-done')).getByRole('button', { name: /reabrir tarefa/i }));

    expect(hook.move).toHaveBeenCalledWith(expect.objectContaining({ id: 'done1' }), 'todo');
  });
});
