import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X112 — a lista lateral entra no construtor como PRIMEIRA coluna (tela 03:
// lista | construtor | resumo) e, abaixo de 1280px, é a gaveta aberta pelo botão
// "Meus segmentos". O TalkXSegments REAL é renderizado; só o CRUD de segmentos
// vira spy (mesmo padrão de TalkXSegments.builder.test.tsx).

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: () => chain,
      rpc: (_name: string, args?: { p_mode?: string }) => Promise.resolve({
        data: args?.p_mode === 'page'
          ? { mode: 'page', rows: [], has_more: false, next_after: null }
          : { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      }),
    },
  };
});

const SEGMENTS = [
  {
    id: 'a', name: 'Base ativa', description: 'Clientes que compraram', origin: 'zapp', status: 'active',
    is_favorite: false, rules: { groups: [] }, estimated_count: 120, last_used_at: null,
    created_by: 'user-1', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-08T12:00:00Z',
  },
  {
    id: 'b', name: 'Campeões RFM', description: null, origin: 'crm360', status: 'inactive',
    is_favorite: true, rules: { groups: [] }, estimated_count: 80, last_used_at: null,
    created_by: 'user-2', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-06T12:00:00Z',
  },
];

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: SEGMENTS, isLoading: false, isError: false, error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: vi.fn() },
      updateSegment: { mutateAsync: vi.fn(), mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Sai da biblioteca (tela 02) para o construtor (tela 03). */
async function abrirConstrutor() {
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
  return screen.findByRole('heading', { name: 'Meus segmentos' });
}

describe('TalkXSegments · lista lateral "Meus segmentos" (X112)', () => {
  it('no construtor a lista lateral mostra os cartões com abas e contadores', async () => {
    await abrirConstrutor();

    expect(screen.getByRole('button', { name: 'Abrir segmento Base ativa' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todos 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo Segmento' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar segmentos...')).toBeInTheDocument();
  });

  it('clicar num cartão carrega o segmento no construtor', async () => {
    await abrirConstrutor();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir segmento Campeões RFM' }));

    const nome = screen.getByPlaceholderText('Nome do segmento…') as HTMLInputElement;
    expect(nome.value).toBe('Campeões RFM');
  });

  it('o botão "Meus segmentos" abre a lista como gaveta', async () => {
    await abrirConstrutor();

    fireEvent.click(screen.getByRole('button', { name: 'Meus segmentos' }));

    const gaveta = await screen.findByRole('dialog');
    expect(within(gaveta).getByRole('button', { name: 'Abrir segmento Base ativa' })).toBeInTheDocument();
  });
});
