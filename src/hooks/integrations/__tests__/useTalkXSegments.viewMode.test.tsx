/**
 * TL-135 / X114 — alternância lista/grade da biblioteca de segmentos.
 *
 * O `viewMode` vive no hook (não em estado local da tela): quem troca de tela e
 * volta precisa reencontrar o mesmo modo. Este arquivo prova o lado do HOOK —
 * o padrão é `list`, a troca vale para grade e voltar funciona, e trocar o modo
 * não pode mexer na seleção em massa (são estados independentes).
 */
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const fromTable = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: (...args: unknown[]) => fromTable(...args) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';

/** Lista da biblioteca (fromTable('talkx_segments').select(...).order(...).order(...)). */
function segmentListBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return builder;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  rpc.mockReset();
  fromTable.mockReset();
  fromTable.mockReturnValue(segmentListBuilder());
  rpc.mockImplementation(async () => ({ data: null, error: null }));
});

describe('X114/TL-135 — alternância lista/grade no hook', () => {
  it('começa em lista e alterna para grade e de volta', () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    expect(result.current.viewMode).toBe('list');

    act(() => result.current.setViewMode('grid'));
    expect(result.current.viewMode).toBe('grid');

    act(() => result.current.setViewMode('list'));
    expect(result.current.viewMode).toBe('list');
  });

  it('trocar o modo não mexe na seleção em massa', () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    act(() => result.current.toggleSelect('s1'));
    expect(result.current.selectedIds).toEqual(['s1']);

    act(() => result.current.setViewMode('grid'));
    expect(result.current.selectedIds).toEqual(['s1']);
    expect(result.current.viewMode).toBe('grid');
  });
});
