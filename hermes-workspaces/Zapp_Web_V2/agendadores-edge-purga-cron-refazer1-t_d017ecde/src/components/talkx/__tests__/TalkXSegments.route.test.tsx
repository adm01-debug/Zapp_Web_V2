import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X111 — o construtor da tela 03 vive no endereço
// (`?view=talkx&tab=segments&segment=<id>&mode=edit|new`): o link direto abre o
// segmento, o F5 mantém a tela, voltar/avançar do navegador fecham e reabrem o
// construtor, e parâmetro inválido devolve a biblioteca. O TalkXSegments REAL
// entra (motor de regras real, via importOriginal); só a lista/CRUD e o toast
// viram spies.

const f = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
const state = vi.hoisted(() => ({ segments: [] as unknown[] }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// countAudience/resolveAudience falam com a RPC talkx_resolve_audience (modo count/page).
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

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: state.segments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: f.create },
      updateSegment: { mutateAsync: f.update },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { toast } from 'sonner';
import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const segmento: TalkXSegment = {
  id: 'seg-1',
  name: 'Segmento antigo',
  description: 'descrição antiga',
  origin: 'custom',
  status: 'active',
  is_favorite: false,
  rules: { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'contains', value: 'VIP' }] }] },
  estimated_count: 10,
  last_used_at: null,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

const params = () => new URLSearchParams(window.location.search);

describe('TalkXSegments · construtor pela URL (X111)', () => {
  beforeEach(() => {
    state.segments = [segmento];
    f.create.mockReset();
    f.update.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('abre no construtor do segmento do endereço, com a trilha da tela 03 (link direto e F5)', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments&segment=seg-1&mode=edit');
    renderView();

    const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    expect(nome.value).toBe('Segmento antigo');
    // A regra real do segmento, não uma lista vazia: o link direto carrega a cópia do banco.
    expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();

    const trilha = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(trilha).toHaveTextContent('Talk X');
    expect(trilha).toHaveTextContent('Campanhas');
    expect(trilha).toHaveTextContent('Segmentos');

    // F5 preserva o endereço que abriu a tela (nada foi normalizado para a biblioteca).
    expect(params().get('segment')).toBe('seg-1');
    expect(params().get('mode')).toBe('edit');
  });

  it('abrir pelo rail grava o segmento no endereço', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments');
    renderView();

    fireEvent.click(await screen.findByText('Segmento antigo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar segmento' }));

    await screen.findByPlaceholderText('Nome do segmento…');
    expect(params().get('segment')).toBe('seg-1');
    expect(params().get('mode')).toBe('edit');
  });

  it('voltar do navegador fecha o construtor e avançar reabre', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments');
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
    await screen.findByPlaceholderText('Nome do segmento…');
    expect(params().get('mode')).toBe('new');

    await act(async () => {
      window.history.replaceState(null, '', '/?view=talkx&tab=segments');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo segmento' })).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull();
    expect(params().has('mode')).toBe(false);

    await act(async () => {
      window.history.replaceState(null, '', '/?view=talkx&tab=segments&mode=new');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.getByPlaceholderText('Nome do segmento…')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Novo segmento' })).toBeNull();
  });

  it('parâmetro inválido cai na biblioteca e limpa o endereço', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments&segment=seg-1&mode=duplicar');
    renderView();

    expect(await screen.findByRole('button', { name: 'Novo segmento' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull();
    await waitFor(() => {
      expect(params().has('mode')).toBe(false);
      expect(params().has('segment')).toBe(false);
      expect(params().get('tab')).toBe('segments');
    });
  });

  it('publicar devolve a tela e o endereço para a biblioteca', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments&segment=seg-1&mode=edit');
    renderView();

    const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    fireEvent.change(nome, { target: { value: 'Segmento renomeado' } });
    f.update.mockResolvedValue({ ...segmento, name: 'Segmento renomeado' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo segmento' })).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull();
    expect(params().has('segment')).toBe(false);
    expect(params().has('mode')).toBe(false);
    expect(params().get('tab')).toBe('segments');
  });

  it('id que a lista não devolve volta para a biblioteca com aviso', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=segments&segment=nao-existe&mode=edit');
    renderView();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Segmento não encontrado/)));
    expect(screen.getByRole('button', { name: 'Novo segmento' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull();
    await waitFor(() => expect(params().has('segment')).toBe(false));
  });
});
