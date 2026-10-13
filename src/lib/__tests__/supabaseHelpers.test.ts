import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { from: mockFrom, functions: { invoke: vi.fn() } },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { fromTable, supabase } from '../supabaseHelpers';

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── delegation ────────────────────────────────────────────────────────────────
describe('fromTable', () => {
  it('calls supabase.from with the provided table name', () => {
    const builder = {};
    mockFrom.mockReturnValue(builder);
    fromTable('contacts');
    expect(mockFrom).toHaveBeenCalledWith('contacts');
  });

  it('returns the query builder from supabase.from', () => {
    const builder = { select: vi.fn() };
    mockFrom.mockReturnValue(builder);
    const result = fromTable('contacts');
    expect(result).toBe(builder);
  });

  it('forwards any table name including dynamic ones', () => {
    const builder = {};
    mockFrom.mockReturnValue(builder);
    fromTable('some_dynamic_table');
    expect(mockFrom).toHaveBeenCalledWith('some_dynamic_table');
  });

  it('calls supabase.from exactly once per invocation', () => {
    mockFrom.mockReturnValue({});
    fromTable('events');
    expect(mockFrom).toHaveBeenCalledOnce();
  });

  it('returns distinct builder instances for successive calls', () => {
    const builderA = { id: 'a' };
    const builderB = { id: 'b' };
    mockFrom.mockReturnValueOnce(builderA).mockReturnValueOnce(builderB);
    expect(fromTable('tableA')).toBe(builderA);
    expect(fromTable('tableB')).toBe(builderB);
  });
});

// ── reexport ──────────────────────────────────────────────────────────────────
describe('reexport do cliente', () => {
  it('expõe o mesmo cliente Supabase do módulo de integração', () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe('function');
  });
});
