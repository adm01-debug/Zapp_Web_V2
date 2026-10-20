import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X008 — o construtor de segmentos não pode zerar a estimativa por causa de uma
// condição em branco, nem publicar sem avisar. Estes testes exercitam o
// TalkXSegments REAL (com o motor de regras real, via importOriginal) e um mock
// de sonner; só o CRUD de segmentos vira spy.
//
// Vermelho antes do fix:
//  (a) adicionar condição vazia zerava a contagem (rulesToPostgrest lançava);
//  (b) Publicar com condição incompleta não avisava nada;
//  (c) erro do banco não virava toast (save() só tinha try/finally).

const f = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

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

// X017 — countAudience/resolveAudience falam com a RPC talkx_resolve_audience
// (modo count/page) em vez do PostgREST: o mock devolve a contagem fixa de 42.
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

// O motor de regras entra REAL (isRuleComplete/splitRules/rulesToPostgrest);
// só a lista e o CRUD de segmentos viram spies.
vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [], isLoading: false, isError: false, error: null,
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

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o construtor, preenche o nome e devolve o botão Publicar. */
async function abrirConstrutor(nome = 'Segmento teste') {
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
  const nomeInput = await screen.findByPlaceholderText('Nome do segmento…');
  fireEvent.change(nomeInput, { target: { value: nome } });
  return screen.findByRole('button', { name: /Publicar segmento/ });
}

describe('TalkXSegments · construtor com condição incompleta (X008)', () => {
  beforeEach(() => {
    f.create.mockReset();
    f.update.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('adicionar condição vazia mantém a contagem anterior', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));

    // Sem regras, a estimativa representa a base inteira: 42 contatos.
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar condição' }));

    await waitFor(() => expect(screen.getByText(/incompleta\(s\) fora da estimativa/)).toBeInTheDocument());
    // A regra vazia fica de fora: a estimativa volta ao mesmo valor (42), nunca 0.
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('Publicar com condição incompleta mostra toast e não chama insert', async () => {
    const publicar = await abrirConstrutor();
    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar condição' }));

    fireEvent.click(publicar);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Complete ou remova/)));
    expect(f.create).not.toHaveBeenCalled();
  });

  it('erro do banco vira toast', async () => {
    const publicar = await abrirConstrutor();
    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar condição' }));
    fireEvent.change(screen.getByPlaceholderText('Valor…'), { target: { value: 'VIP' } });
    f.create.mockRejectedValue(new Error('permission denied for table talkx_segments'));

    fireEvent.click(publicar);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar segmento')));
  });
});
