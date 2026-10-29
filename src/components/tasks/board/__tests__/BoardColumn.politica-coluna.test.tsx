/**
 * N-181: botão "Política da coluna" com área mínima de 24 px (44 no celular).
 *
 * O botão no cabeçalho da coluna tinha h-5 w-5 (20×20 px), abaixo do mínimo
 * de 24 px para touch target. A correção troca para min-h-[24px] min-w-[24px]
 * com 44 px em telas estreitas (max-md).
 *
 * Prova: o botão renderizado tem as classes de tamanho mínimo no className.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DragDropContext } from '@hello-pangea/dnd';
import { BoardColumn } from '../BoardColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

function item(over: Record<string, unknown> = {}): WorkItem {
  return {
    id: 't1',
    title: 'Tarefa de teste',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: '2026-09-29T10:00:00.000Z',
    completed_at: null,
    contact_id: null,
    created_by: 'u1',
    assigned_to: 'u1',
    ...over,
  } as WorkItem;
}

const baseProps = {
  status: 'todo' as WorkItemStatus,
  items: [item()],
  isLoading: false,
  doingCount: 1,
  dragSourceStatus: null as WorkItemStatus | null,
  onOpen: () => {},
  onMoveTo: () => {},
  onDelete: () => {},
};

describe('BoardColumn — botão Política da coluna (N-181)', () => {
  it('botão tem área mínima de 24 px (min-h-[24px] min-w-[24px])', () => {
    render(
      <TooltipProvider>
        <DragDropContext onDragEnd={() => {}}>
          <BoardColumn {...baseProps} />
        </DragDropContext>
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: 'Política da coluna' });
    const className = btn.className;

    expect(className).toContain('min-h-[24px]');
    expect(className).toContain('min-w-[24px]');
  });

  it('botão tem área de 44 px em telas estreitas (max-md)', () => {
    render(
      <TooltipProvider>
        <DragDropContext onDragEnd={() => {}}>
          <BoardColumn {...baseProps} />
        </DragDropContext>
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: 'Política da coluna' });
    const className = btn.className;

    expect(className).toContain('max-md:min-h-[44px]');
    expect(className).toContain('max-md:min-w-[44px]');
  });
});
