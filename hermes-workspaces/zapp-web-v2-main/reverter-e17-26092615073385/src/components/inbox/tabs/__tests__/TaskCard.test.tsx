import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCard } from '../TaskCard';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

function makeTask(overrides: Partial<ConversationTask>): ConversationTask {
  return {
    id: 't1',
    contact_id: 'c1',
    title: 'Enviar catálogo',
    description: null,
    priority: 'medium',
    status: 'open',
    due_date: null,
    assigned_to: null,
    created_by: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('renders title, description and priority chip', () => {
    render(<TaskCard task={makeTask({ description: 'Compartilhar opções' })} onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Enviar catálogo')).toBeInTheDocument();
    expect(screen.getByText('Compartilhar opções')).toBeInTheDocument();
    expect(screen.getByText('Média')).toBeInTheDocument();
  });

  it('shows an overdue due date in destructive tone', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    render(<TaskCard task={makeTask({ due_date: past, priority: 'high' })} onToggle={vi.fn()} onDelete={vi.fn()} />);
    const dueEl = screen.getByText(/,/, { selector: 'span' });
    expect(dueEl.className).toContain('text-destructive');
  });

  it('shows a due-today date in warning tone', () => {
    const today = new Date();
    today.setHours(18, 0, 0, 0);
    render(<TaskCard task={makeTask({ due_date: today.toISOString() })} onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/^Hoje,/)).toBeInTheDocument();
  });

  it('shows a future due date in muted tone', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    render(<TaskCard task={makeTask({ due_date: future })} onToggle={vi.fn()} onDelete={vi.fn()} />);
    const dueEl = screen.getByText(/,/, { selector: 'span' });
    expect(dueEl.className).toContain('text-muted-foreground');
  });

  it('renders a "Concluída" badge and strikethrough title for completed tasks', () => {
    render(<TaskCard task={makeTask({ status: 'completed' })} onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(screen.getByText('Enviar catálogo').className).toContain('line-through');
  });

  it('calls onToggle when the checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(<TaskCard task={makeTask({})} onToggle={onToggle} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Concluir Enviar catálogo'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete with the task id from the menu', () => {
    const onDelete = vi.fn();
    render(<TaskCard task={makeTask({ id: 't42' })} onToggle={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('Excluir'));
    expect(onDelete).toHaveBeenCalledWith('t42');
  });
});
