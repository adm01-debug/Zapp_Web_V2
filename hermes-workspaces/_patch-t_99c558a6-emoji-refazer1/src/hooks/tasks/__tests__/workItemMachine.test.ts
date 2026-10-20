import { describe, it, expect } from 'vitest';
import { canTransition, applyTransition, countDoing, agingDays } from '../workItemMachine';
import type { WorkItem } from '../workItem.types';

const baseItem: WorkItem = {
  id: 'item-1',
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
  status_changed_at: new Date('2026-09-28T10:00:00Z').toISOString(),
  completed_at: null,
  contact_id: null,
  created_by: 'profile-1',
  assigned_to: 'profile-1',
  created_at: new Date('2026-09-28T09:00:00Z').toISOString(),
  updated_at: new Date('2026-09-28T09:00:00Z').toISOString(),
};

// WIP hard
describe('canTransition – WIP doing', () => {
  it('bloqueia quando doingCount >= 3', () => {
    const r = canTransition('todo', 'doing', { doingCount: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wip_full');
  });
  it('permite quando doingCount = 2', () => {
    const r = canTransition('todo', 'doing', { doingCount: 2 });
    expect(r.ok).toBe(true);
  });
  it('permite mover dentro de doing (reordenação)', () => {
    const r = canTransition('doing', 'doing', { doingCount: 3 });
    expect(r.ok).toBe(true);
  });
});

// Waiting exige motivo
describe('canTransition – waiting', () => {
  it('bloqueia sem motivo', () => {
    const r = canTransition('doing', 'waiting', { doingCount: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('waiting_reason_required');
  });
  it('permite com motivo', () => {
    const r = canTransition('doing', 'waiting', { doingCount: 1, waitingReason: 'Aguardando cliente' });
    expect(r.ok).toBe(true);
  });
  it('bloqueia com motivo vazio', () => {
    const r = canTransition('todo', 'waiting', { doingCount: 0, waitingReason: '   ' });
    expect(r.ok).toBe(false);
  });
});

// done → só reabrir para todo
describe('canTransition – done', () => {
  it('permite reabrir para todo', () => {
    const r = canTransition('done', 'todo', { doingCount: 0 });
    expect(r.ok).toBe(true);
  });
  it('bloqueia mover para doing quando done', () => {
    const r = canTransition('done', 'doing', { doingCount: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_transition');
  });
});

// cancelled → sem saída
describe('canTransition – cancelled', () => {
  it('bloqueia qualquer transição', () => {
    const r = canTransition('cancelled', 'todo', { doingCount: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_transition');
  });
});

// applyTransition
describe('applyTransition', () => {
  const now = new Date('2026-10-01T12:00:00Z');

  it('preenche started_at na primeira entrada em doing', () => {
    const result = applyTransition(baseItem, 'doing', now);
    expect(result.started_at).toBe(now.toISOString());
    expect(result.status).toBe('doing');
  });

  it('não sobrescreve started_at se já preenchido', () => {
    const withStarted = { ...baseItem, started_at: '2026-09-29T08:00:00Z', status: 'waiting' as const };
    const result = applyTransition(withStarted, 'doing', now);
    expect(result.started_at).toBe('2026-09-29T08:00:00Z');
  });

  it('preenche completed_at e limpa remind_at ao concluir', () => {
    const withRemind = { ...baseItem, status: 'doing' as const, remind_at: '2026-10-02T09:00:00Z' };
    const result = applyTransition(withRemind, 'done', now);
    expect(result.completed_at).toBeTruthy();
    expect(result.remind_at).toBeNull();
    expect(result.notified_at).toBeNull();
  });

  it('reabrir limpa completed_at', () => {
    const done = { ...baseItem, status: 'done' as const, completed_at: '2026-09-30T17:00:00Z' };
    const result = applyTransition(done, 'todo', now);
    expect(result.completed_at).toBeNull();
    expect(result.status).toBe('todo');
  });

  it('waiting → out limpa waiting_reason', () => {
    const waiting = { ...baseItem, status: 'waiting' as const, waiting_reason: 'Cliente ausente' };
    const result = applyTransition(waiting, 'doing', now);
    expect(result.waiting_reason).toBeNull();
  });
});

// helpers
describe('countDoing + agingDays', () => {
  it('conta corretamente', () => {
    const items = [
      { status: 'doing' as const }, { status: 'doing' as const }, { status: 'todo' as const },
    ];
    expect(countDoing(items)).toBe(2);
  });

  it('calcula aging em dias', () => {
    const now = new Date('2026-10-03T10:00:00Z');
    const item = { ...baseItem, status_changed_at: '2026-09-30T10:00:00Z' };
    expect(agingDays(item, now)).toBe(3);
  });
});
