import { describe, it, expect } from 'vitest';
import { deriveTaskGroups, type ConversationTask } from '@/hooks/chat/useConversationTasks';

function task(overrides: Partial<ConversationTask>): ConversationTask {
  return {
    id: 't1', contact_id: 'c1', title: 'Tarefa', description: null, priority: 'medium',
    status: 'pending', due_date: null, assigned_to: null, created_by: null,
    completed_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('deriveTaskGroups', () => {
  it('separa atrasadas, hoje e proximas entre as tarefas abertas', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const todayAt = new Date().toISOString();

    const tasks = [
      task({ id: 'overdue', due_date: yesterday }),
      task({ id: 'today', due_date: todayAt }),
      task({ id: 'upcoming', due_date: inTwoDays }),
      task({ id: 'no-due', due_date: null }),
    ];

    const groups = deriveTaskGroups(tasks);
    expect(groups.overdue.map((t) => t.id)).toEqual(['overdue']);
    expect(groups.today.map((t) => t.id)).toEqual(['today']);
    expect(groups.upcoming.map((t) => t.id).sort()).toEqual(['no-due', 'upcoming']);
  });

  it('separa concluidas dos ultimos 7 dias das mais antigas', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    const tasks = [
      task({ id: 'recent', status: 'completed', completed_at: twoDaysAgo }),
      task({ id: 'old', status: 'completed', completed_at: twentyDaysAgo }),
    ];

    const groups = deriveTaskGroups(tasks);
    expect(groups.completed).toHaveLength(2);
    expect(groups.completed7d.map((t) => t.id)).toEqual(['recent']);
  });

  it('tarefas concluidas nao aparecem em open/overdue/today/upcoming', () => {
    const tasks = [task({ id: 'done', status: 'completed', completed_at: new Date().toISOString() })];
    const groups = deriveTaskGroups(tasks);
    expect(groups.open).toHaveLength(0);
    expect(groups.overdue).toHaveLength(0);
    expect(groups.today).toHaveLength(0);
    expect(groups.upcoming).toHaveLength(0);
  });

  it('lista vazia produz todos os grupos vazios', () => {
    const groups = deriveTaskGroups([]);
    expect(Object.values(groups).every((g) => g.length === 0)).toBe(true);
  });
});
