import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X112 · alternância lista/grade da biblioteca de segmentos.
 *
 * A preferência de modo vive no hook (`useTalkXSegments`) e a tela troca SÓ o
 * contêiner: o MESMO cartão (`data-testid="segment-card"`) aparece na lista
 * (`segments-list`, uma coluna) e na grade (`segments-grid`). O teste prova os
 * dois lados — o contêiner muda e a quantidade de cartões não (nenhuma árvore
 * visual duplicada), e o `aria-pressed` acompanha o modo.
 */

let respostaSegments: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // A alternância não depende dos KPIs: a RPC de stats devolve nulo (a tela cai
    // no esqueleto) e as demais RPCs (audiência) devolvem vazio.
    rpc: (name: string) => {
      if (name === 'talkx_segment_library_stats') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: { eligible: 0, rows: [], has_more: false, next_after: null }, error: null });
    },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: respostaSegments, error: null }) }) }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

import { TalkXSegments } from '../TalkXSegments';

const SEGMENTS = [
  {
    id: 's1', name: 'VIP', description: 'Clientes de alto valor', origin: 'crm360', status: 'active', is_favorite: true,
    rules: { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'eq', value: 'vip' }] }] },
    estimated_count: 120, last_used_at: '2026-10-01T12:00:00Z', created_by: 'user-1', created_at: '2026-09-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
  },
  {
    id: 's2', name: 'Inativos 90d', description: null, origin: 'zapp', status: 'inactive', is_favorite: false,
    rules: { groups: [] }, estimated_count: 40, last_used_at: null, created_by: 'user-1', created_at: '2026-09-02T12:00:00Z', updated_at: '2026-09-02T12:00:00Z',
  },
];

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => { respostaSegments = SEGMENTS; });

describe('TalkXSegments · alternância lista/grade (X112)', () => {
  it('abre em lista, vai para grade e volta — mesmo cartão nos dois modos', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('VIP')).toBeTruthy());

    // Modo padrão: lista (uma coluna), sem grade.
    expect(screen.getByTestId('segments-list')).toBeTruthy();
    expect(screen.queryByTestId('segments-grid')).toBeNull();
    expect(screen.getAllByTestId('segment-card')).toHaveLength(2);
    expect(screen.getByTestId('segments-view-list').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('segments-view-grid').getAttribute('aria-pressed')).toBe('false');

    // Troca para grade: o contêiner muda, e os mesmos dois cartões continuam ali.
    fireEvent.click(screen.getByTestId('segments-view-grid'));
    expect(screen.getByTestId('segments-grid')).toBeTruthy();
    expect(screen.queryByTestId('segments-list')).toBeNull();
    expect(screen.getAllByTestId('segment-card')).toHaveLength(2);
    expect(screen.getByTestId('segments-view-grid').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('segments-view-list').getAttribute('aria-pressed')).toBe('false');

    // Volta para a lista.
    fireEvent.click(screen.getByTestId('segments-view-list'));
    expect(screen.getByTestId('segments-list')).toBeTruthy();
    expect(screen.queryByTestId('segments-grid')).toBeNull();
    expect(screen.getAllByTestId('segment-card')).toHaveLength(2);
  });

  it('o cartão mantém o que a lista mostrava: origem, status, público e critério', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('VIP')).toBeTruthy());

    fireEvent.click(screen.getByTestId('segments-view-grid'));
    const cartaoVip = screen.getByText('VIP').closest('[data-testid="segment-card"]') as HTMLElement;
    expect(cartaoVip.textContent).toContain('CRM 360°');
    expect(cartaoVip.textContent).toContain('Ativo');
    expect(cartaoVip.textContent).toContain('120');

    const cartaoInativos = screen.getByText('Inativos 90d').closest('[data-testid="segment-card"]') as HTMLElement;
    expect(cartaoInativos.textContent).toContain('Toda a base');
    expect(cartaoInativos.textContent).toContain('Inativo');
  });
});
