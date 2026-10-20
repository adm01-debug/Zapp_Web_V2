import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { rulesToPostgrest } from '@/hooks/integrations/useTalkXSegments';

describe('rulesToPostgrest', () => {
  it('fails closed instead of dropping an unknown rule', () => {
    expect(() => rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'unknown_field', op: 'eq', value: 'restricted' },
      ] }],
    } as never)).toThrow('Regra de segmento inválida');
  });

  it('keeps a valid rule as a PostgREST filter', () => {
    expect(rulesToPostgrest({
      groups: [{ id: 'group-1', match: 'and', rules: [
        { id: 'rule-1', field: 'company', op: 'eq', value: 'Acme' },
      ] }],
    })).toBe('company.eq."Acme"');
  });
});
