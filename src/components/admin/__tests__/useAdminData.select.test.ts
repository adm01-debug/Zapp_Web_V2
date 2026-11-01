import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const selects = vi.hoisted(() => [] as Array<{ table: string; cols: string }>);

vi.mock('sonner', () => ({ toast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'http://localhost',
  supabase: {
    from: (t: string) => {
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => { selects.push({ table: t, cols }); return b; };
      for (const m of ['order', 'limit', 'eq', 'in', 'neq', 'range', 'gte', 'lte']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return b;
    },
  },
}));

import { useAdminData } from '@/components/admin/useAdminData';

describe('useAdminData — select explícito em audit_logs', () => {
  beforeEach(() => { selects.length = 0; });

  it('.select() da aba de auditoria usa lista explícita (sem select("*"))', async () => {
    const { result } = renderHook(() => useAdminData('audit'));

    await act(async () => { await result.current.fetchData(); });

    const al = selects.filter(s => s.table === 'audit_logs');
    expect(al.length).toBeGreaterThan(0);
    for (const s of al) expect(s.cols).not.toBe('*');

    const cols = al[0].cols;
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('action');
    expect(cols).toContain('entity_type');
    expect(cols).toContain('created_at');
    expect(cols).toContain('details');
  });
});
