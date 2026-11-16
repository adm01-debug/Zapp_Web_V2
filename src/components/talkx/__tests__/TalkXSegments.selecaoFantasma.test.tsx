import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Depois de excluir/arquivar em lote, o segmento selecionado some da lista carregada:
// o rail não pode continuar mostrando o "segmento fantasma".

const state = vi.hoisted(() => ({ segments: [] as unknown[] }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'not', 'or', 'order', 'limit', 'eq']) chain[k] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: () => chain,
      rpc: () => Promise.resolve({ data: { mode: 'count', eligible: 1, rows: [], has_more: false, next_after: null }, error: null }),
    },
  };
});
vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: state.segments, isLoading: false, isError: false, error: null, refetch: vi.fn(),
      createSegment: { mutateAsync: vi.fn() }, updateSegment: { mutateAsync: vi.fn() },
      deleteSegment: { mutate: vi.fn() }, refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const seg = (id: string, name: string): TalkXSegment => ({
  id, name, description: `desc ${name}`, origin: 'custom', status: 'active', is_favorite: false,
  rules: { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'contains', value: 'VIP' }] }] },
  estimated_count: 10, last_used_at: null, created_by: null,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
} as TalkXSegment);

describe('TalkXSegments · seleção some junto com o segmento', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('zera o rail quando o segmento selecionado sai da lista carregada', async () => {
    state.segments = [seg('a', 'Segmento A'), seg('b', 'Segmento B')];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = () => (
      <QueryClientProvider client={qc}><TalkXSegments onUseCampaign={() => {}} /></QueryClientProvider>
    );
    const { rerender } = render(ui());
    fireEvent.click(await screen.findByText('Segmento A'));
    expect(await screen.findByRole('button', { name: 'Editar segmento' })).toBeInTheDocument();

    state.segments = [seg('b', 'Segmento B')];
    rerender(ui());

    expect(screen.queryByRole('button', { name: 'Editar segmento' })).toBeNull();
    expect(screen.queryByText('desc Segmento A')).toBeNull();
  });
});
