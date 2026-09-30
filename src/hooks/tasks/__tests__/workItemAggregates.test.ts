import { describe, it, expect } from 'vitest';
import { bucketByDue, bucketByStatus, kpis, dueLabel, weekBuckets } from '../workItemAggregates';
import type { WorkItem } from '../workItem.types';

const now = new Date('2026-10-03T12:00:00Z');

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Test',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: now.toISOString(),
    completed_at: null,
    contact_id: null,
    created_by: 'p1',
    assigned_to: 'p1',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe('bucketByDue', () => {
  it('classifica atrasada corretamente', () => {
    const item = makeItem({ due_date: '2026-10-01T10:00:00Z' }); // 2 dias atrás
    const b = bucketByDue([item], now);
    expect(b.overdue).toHaveLength(1);
    expect(b.today).toHaveLength(0);
  });

  it('classifica hoje', () => {
    const item = makeItem({ due_date: '2026-10-03T08:00:00Z' }); // hoje
    const b = bucketByDue([item], now);
    expect(b.today).toHaveLength(1);
  });

  it('classifica amanhã', () => {
    const item = makeItem({ due_date: '2026-10-04T08:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.tomorrow).toHaveLength(1);
  });

  it('classifica sem prazo', () => {
    const item = makeItem({ due_date: null });
    const b = bucketByDue([item], now);
    expect(b.noDue).toHaveLength(1);
  });

  it('done7d inclui concluída na semana', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-29T10:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.done7d).toHaveLength(1);
  });

  it('done7d exclui concluída > 7 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-24T10:00:00Z' });
    const b = bucketByDue([item], now);
    expect(b.done7d).toHaveLength(0);
  });

  it('doneOlder inclui concluída entre 8 e 30 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-09-20T10:00:00Z' }); // 13 dias atrás
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(1);
    expect(b.done7d).toHaveLength(0);
  });

  it('doneOlder exclui concluída dentro dos 7 dias (fica em done7d)', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-10-02T10:00:00Z' }); // 1 dia
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(0);
    expect(b.done7d).toHaveLength(1);
  });

  it('doneOlder exclui concluída com mais de 30 dias', () => {
    const item = makeItem({ status: 'done', completed_at: '2026-08-20T10:00:00Z' }); // 44 dias
    const b = bucketByDue([item], now);
    expect(b.doneOlder).toHaveLength(0);
    expect(b.done7d).toHaveLength(0);
  });

  it('exclui done de active buckets', () => {
    const item = makeItem({ status: 'done', due_date: '2026-10-01T10:00:00Z', completed_at: now.toISOString() });
    const b = bucketByDue([item], now);
    expect(b.overdue).toHaveLength(0);
  });
});

describe('bucketByStatus', () => {
  it('distribui por status', () => {
    const items = [
      makeItem({ status: 'doing' }),
      makeItem({ status: 'doing' }),
      makeItem({ status: 'todo' }),
    ];
    const b = bucketByStatus(items);
    expect(b.doing).toHaveLength(2);
    expect(b.todo).toHaveLength(1);
    expect(b.backlog).toHaveLength(0);
  });

  it('ordena por position depois priority', () => {
    const items = [
      makeItem({ status: 'todo', position: 2, priority: 'low' }),
      makeItem({ status: 'todo', position: 0, priority: 'high' }),
      makeItem({ status: 'todo', position: 1, priority: 'medium' }),
    ];
    const b = bucketByStatus(items);
    expect(b.todo[0].position).toBe(0);
    expect(b.todo[1].position).toBe(1);
    expect(b.todo[2].position).toBe(2);
  });
});

describe('kpis', () => {
  it('conta overdue, dueToday, doingCount, done7d', () => {
    const items = [
      makeItem({ status: 'doing' }),
      makeItem({ due_date: '2026-10-01T10:00:00Z' }), // overdue
      makeItem({ due_date: '2026-10-03T10:00:00Z' }), // today
      makeItem({ status: 'done', completed_at: '2026-09-29T10:00:00Z' }),
    ];
    const k = kpis(items, now);
    expect(k.overdue).toBe(1);
    expect(k.dueToday).toBe(1);
    expect(k.doingCount).toBe(1);
    expect(k.done7d).toBe(1);
  });

  it('avgCycleTimeDays null sem dados', () => {
    const k = kpis([], now);
    expect(k.avgCycleTimeDays).toBeNull();
  });
});

describe('dueLabel', () => {
  it('retorna Atrasada para data passada', () => {
    const { overdue } = dueLabel('2026-10-01T10:00:00Z', now);
    expect(overdue).toBe(true);
  });
  it('retorna Hoje para hoje', () => {
    const { label } = dueLabel('2026-10-03T08:00:00Z', now);
    expect(label).toBe('Hoje');
  });
  it('retorna Amanhã para amanhã', () => {
    const { label } = dueLabel('2026-10-04T08:00:00Z', now);
    expect(label).toMatch(/amanh/i);
  });
});

describe('weekBuckets', () => {
  it('distribui por dia de remind_at e due_date', () => {
    const start = new Date('2026-10-06T00:00:00Z'); // segunda
    const items = [
      makeItem({ remind_at: '2026-10-06T09:00:00Z' }),
      makeItem({ due_date: '2026-10-07T00:00:00Z' }),
    ];
    const wb = weekBuckets(items, start);
    expect(wb[0].reminders).toHaveLength(1); // seg
    expect(wb[1].dueTasks).toHaveLength(1);  // ter
  });
});
