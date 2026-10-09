import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #408 (R2-MOD-038) — o rail de detalhe do segmento continuava com a cópia que
// estava em tela antes de salvar (TalkXSegments.tsx:76-78 descartava a linha
// devolvida pelo update e o rail em :187 lê `selected`). Efeito para o usuário:
// depois de Salvar, o detalhe mostrado é o antigo e "Editar segmento" reabre o
// construtor com nome/descrição/regras obsoletos.
//
// Vermelho antes do fix: (a) o detalhe não mostra a descrição salva; (b) reabrir
// o editor traz o nome e o valor da condição antigos.
//
// O TalkXSegments REAL entra (motor de regras real, via importOriginal); só a
// lista e o CRUD de segmentos viram spies.

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

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const regraAntiga = { id: 'r1', field: 'tags' as const, op: 'contains' as const, value: 'VIP' };
const regraNova = { id: 'r1', field: 'tags' as const, op: 'contains' as const, value: 'OURO' };

/** Cópia que a lista tem em tela quando o usuário abre o detalhe. */
const antigo: TalkXSegment = {
  id: 'seg-1',
  name: 'Segmento antigo',
  description: 'descrição antiga',
  origin: 'custom',
  status: 'active',
  is_favorite: false,
  rules: { groups: [{ id: 'g1', match: 'and', rules: [regraAntiga] }] },
  estimated_count: 10,
  last_used_at: null,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

/** Linha que o banco devolve depois do Salvar (nome, descrição e regra novos). */
const salvo: TalkXSegment = {
  ...antigo,
  name: 'Segmento novo',
  description: 'descrição nova',
  rules: { groups: [{ id: 'g1', match: 'and', rules: [regraNova] }] },
  estimated_count: 77,
  updated_at: '2026-10-06T12:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Seleciona o segmento na lista e abre o construtor pelo botão do rail. */
async function abrirEditorPeloDetalhe() {
  renderView();
  fireEvent.click(await screen.findByText('Segmento antigo'));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar segmento' }));
  return (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
}

/** Altera os três campos e confirma o Salvar. */
async function editarESalvar() {
  fireEvent.change(await screen.findByPlaceholderText('Nome do segmento…'), { target: { value: 'Segmento novo' } });
  fireEvent.change(screen.getByPlaceholderText(/Adicione uma descrição/), { target: { value: 'descrição nova' } });
  fireEvent.change(screen.getByPlaceholderText('Valor…'), { target: { value: 'OURO' } });
  f.update.mockResolvedValue(salvo);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
}

describe('TalkXSegments · detalhe do segmento depois de salvar (#408)', () => {
  beforeEach(() => {
    state.segments = [antigo];
    f.create.mockReset();
    f.update.mockReset();
  });

  it('o detalhe passa a mostrar a cópia salva, não a que estava em tela', async () => {
    const nome = await abrirEditorPeloDetalhe();
    expect(nome.value).toBe('Segmento antigo');

    editarESalvar();

    // A linha devolvida pelo update é a fonte do detalhe depois de salvar.
    await waitFor(() => expect(screen.getByText('descrição nova')).toBeInTheDocument());
    expect(screen.getByText('Segmento novo')).toBeInTheDocument();
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'seg-1',
      name: 'Segmento novo',
      description: 'descrição nova',
    }));
  });

  it('reabrir o editor depois de salvar não traz nome nem condição obsoletos', async () => {
    await abrirEditorPeloDetalhe();

    editarESalvar();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar segmento' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Editar segmento' }));

    const nomeReaberto = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    expect(nomeReaberto.value).toBe('Segmento novo');
    expect(screen.getByDisplayValue('OURO')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('VIP')).toBeNull();
  });

  it('publicar um segmento novo continua fechando o construtor e chamando o insert', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
    fireEvent.change(await screen.findByPlaceholderText('Nome do segmento…'), { target: { value: 'Segmento novo' } });
    f.create.mockResolvedValue(salvo);

    fireEvent.click(screen.getByRole('button', { name: 'Publicar segmento' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo segmento' })).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull();
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Segmento novo' }));
    expect(f.update).not.toHaveBeenCalled();
  });
});
