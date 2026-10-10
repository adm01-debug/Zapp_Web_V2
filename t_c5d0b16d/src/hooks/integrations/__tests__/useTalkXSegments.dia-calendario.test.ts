import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { rulesToPostgrest } from '@/hooks/integrations/useTalkXSegments';

/**
 * "nos ultimos (dias)" / "ha mais de (dias)" sao contagens em DIAS DE CALENDARIO
 * (comportamento do R3-06 na timeline do Historico), nao janelas de N*24h corridas.
 *
 * O defeito aparecia as 22h30 em Sao Paulo: a janela de 7 dias terminava em
 * 24/09 01:30Z (= 23/09 22:30 em SP, ou seja, o 8o dia de calendario) em vez de
 * 24/09 03:00Z (= 24/09 00:00 em SP). O filtro de audiencia ficava um dia mais largo.
 */
const regra = (op: 'in_last_days' | 'not_in_last_days', value: string) => ({
  groups: [{ id: 'g1', match: 'and' as const, rules: [{ id: 'r1', field: 'created_at' as const, op, value }] }],
});

describe('rulesToPostgrest — dias de calendario no fuso de Sao Paulo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta 7 dias de calendario incluindo hoje, nao 168 horas corridas', () => {
    // 30/09/2026 22:30 em Sao Paulo = 01/10/2026 01:30Z (ja virou o dia em UTC)
    vi.setSystemTime(new Date('2026-09-30T22:30:00-03:00'));
    // 24..30/09 = 7 dias; comeca na meia-noite de 24/09 em SP
    expect(rulesToPostgrest(regra('in_last_days', '7'))).toBe('created_at.gte.2026-09-24T03:00:00.000Z');
  });

  it('not_in_last_days corta exatamente no mesmo inicio de dia', () => {
    vi.setSystemTime(new Date('2026-09-30T22:30:00-03:00'));
    expect(rulesToPostgrest(regra('not_in_last_days', '7'))).toBe('created_at.lt.2026-09-24T03:00:00.000Z');
  });

  it('1 dia = o dia de hoje (nao as ultimas 24 horas)', () => {
    vi.setSystemTime(new Date('2026-09-30T22:30:00-03:00'));
    expect(rulesToPostgrest(regra('in_last_days', '1'))).toBe('created_at.gte.2026-09-30T03:00:00.000Z');
  });

  it('2 dias cobrem hoje e ontem, mesmo depois das 21h', () => {
    vi.setSystemTime(new Date('2026-09-30T22:30:00-03:00'));
    expect(rulesToPostgrest(regra('in_last_days', '2'))).toBe('created_at.gte.2026-09-29T03:00:00.000Z');
  });

  it('vale igual de manha (a fronteira e de calendario, nao depende da hora do dia)', () => {
    vi.setSystemTime(new Date('2026-10-01T09:00:00-03:00'));
    expect(rulesToPostgrest(regra('in_last_days', '7'))).toBe('created_at.gte.2026-09-25T03:00:00.000Z');
  });

  it('continua recusando contagem invalida em vez de alargar a audiencia', () => {
    vi.setSystemTime(new Date('2026-09-30T22:30:00-03:00'));
    expect(() => rulesToPostgrest(regra('in_last_days', '0'))).toThrow('Regra de segmento inválida');
    expect(() => rulesToPostgrest(regra('in_last_days', 'abc'))).toThrow('Regra de segmento inválida');
    expect(() => rulesToPostgrest(regra('not_in_last_days', '0'))).toThrow('Regra de segmento inválida');
  });
});
