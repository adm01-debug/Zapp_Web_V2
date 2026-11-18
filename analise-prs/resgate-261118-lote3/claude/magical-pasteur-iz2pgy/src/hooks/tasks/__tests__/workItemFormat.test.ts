import { describe, it, expect } from 'vitest';
import { formatWorkItemDate, formatWorkItemDay, formatWorkItemField } from '../workItemFormat';

const AGORA = new Date(2026, 9, 11, 20, 0); // 11 out 2026, 20:00 local

// Helper: runs a callback with the process timezone set to `tz`, then restores.
function withTimeZone(tz: string, fn: () => void): void {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try { fn(); } finally { process.env.TZ = original ?? ''; }
}

describe('formatWorkItemDate', () => {
  it('hoje às 08:00 em UTC-3', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatWorkItemDate('2026-10-11T08:00:00-03:00', { now: AGORA })).toBe('Hoje, 08:00');
    });
  });

  it('ontem às 15:30 em UTC-3', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatWorkItemDate('2026-10-10T15:30:00-03:00', { now: AGORA })).toBe('Ontem, 15:30');
    });
  });

  it('data futura exibe data completa', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatWorkItemDate('2026-11-01T10:00:00-03:00', { now: AGORA })).toBe('01/11/2026, 10:00');
    });
  });

  it('data passada distante exibe data completa', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatWorkItemDate('2026-09-01T10:00:00-03:00', { now: AGORA })).toBe('01/09/2026, 10:00');
    });
  });

  it('retorna null para entradas inválidas', () => {
    expect(formatWorkItemDate(null)).toBeNull();
    expect(formatWorkItemDate(undefined)).toBeNull();
    expect(formatWorkItemDate('nao-e-data')).toBeNull();
    expect(formatWorkItemDay('', AGORA)).toBeNull();
    expect(formatWorkItemField(null)).toEqual({ date: null, time: null });
  });

  it('aceita o ISO com offset que o banco devolve', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatWorkItemDate('2026-10-11T17:00:00-03:00', { now: AGORA })).toBe('Hoje, 17:00');
    });
  });

  it('ISO em Z que vira outro dia local em UTC-3 é lido no fuso local', () => {
    withTimeZone('America/Sao_Paulo', () => {
      // 2026-10-12T02:30:00Z = 11/10 23:30 em UTC-3 → ainda o dia local 11.
      expect(formatWorkItemDate('2026-10-12T02:30:00Z', { now: new Date(2026, 9, 11, 20, 0) })).toBe('Hoje, 23:30');
    });
  });
});
