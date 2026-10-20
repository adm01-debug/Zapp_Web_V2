import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X115 — colunas e ações de linha da biblioteca de segmentos (tela 02).
 *
 * A biblioteca mostrava só o RÓTULO do campo em cada chip ("Tags", "Lead score") e
 * uma coluna "Público relativo" que não existe no mock; o menu ⋮ não tinha Duplicar
 * nem Ativar/Inativar e a linha não respondia ao teclado. O que este teste protege:
 *
 *  1. o critério é legível por inteiro (campo + operador + valor) e o que passa de
 *     três condições vira "+N" com a dica listando as demais;
 *  2. a origem `custom` é o "Segmentado" do mock, não "Personalizado";
 *  3. segmento sem campanha mostra "Nunca usado" e "Sem dados ainda", e a coluna
 *     "Público relativo" (barra derivada de `estimated_count`) saiu;
 *  4. Duplicar cria a cópia ("Cópia de …") e abre ELA no construtor, não o original;
 *  5. Ativar/Inativar grava o status oposto ao da linha;
 *  6. a linha recebe foco e o Enter abre o mesmo detalhe do clique.
 *
 * O TalkXSegments REAL entra (motor de regras real, via importOriginal); só a lista
 * e o CRUD de segmentos viram espiões.
 */

const f = vi.hoisted(() => ({ duplicate: vi.fn(), update: vi.fn() }));

const state = vi.hoisted(() => ({ segments: [] as unknown[] }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// O rail e o construtor chamam useAudienceEstimate -> RPC talkx_resolve_audience.
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
      createSegment: { mutate: vi.fn(), mutateAsync: vi.fn() },
      updateSegment: { mutate: vi.fn(), mutateAsync: f.update },
      duplicateSegment: { mutate: vi.fn(), mutateAsync: f.duplicate },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

/** Segmento do mock: 4 condições — a 4ª tem de aparecer na dica do "+1". */
const vip: TalkXSegment = {
  id: 'seg-1',
  name: 'Clientes VIP',
  description: 'Altíssimo valor e recorrência',
  origin: 'custom',
  status: 'inactive',
  is_favorite: false,
  rules: {
    groups: [{
      id: 'g1',
      match: 'and',
      rules: [
        { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' },
        { id: 'r2', field: 'lead_score', op: 'gt', value: '1000' },
        { id: 'r3', field: 'city', op: 'eq', value: 'São Paulo' },
        { id: 'r4', field: 'state', op: 'eq', value: 'SP' },
      ],
    }],
  },
  estimated_count: 1248,
  last_used_at: null,
  created_by: null,
  created_at: '2026-09-15T12:00:00.000Z',
  updated_at: '2026-09-15T12:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o ⋮ da linha e escolhe o item do menu. */
function usarAcaoDa(nomeDoSegmento: string, acao: string) {
  const gatilho = screen.getByRole('button', { name: `Ações de ${nomeDoSegmento}` });
  // Radix abre o menu pelo teclado (o clique do jsdom não dispara pointerdown).
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: acao }));
}

beforeEach(() => {
  cleanup();
  state.segments = [vip];
  f.duplicate.mockReset();
  f.update.mockReset();
});

describe('X115 — colunas da biblioteca de segmentos', () => {
  it('critério sai campo + operador + valor e o resto vira "+1" com a dica listando o demais', () => {
    // Pior caso da coluna junto do melhor: um segmento sem nenhuma condição.
    state.segments = [vip, { ...vip, id: 'seg-2', name: 'Base inteira', rules: { groups: [] } }];
    renderView();

    expect(screen.getByText('Tags contém VIP')).toBeTruthy();
    expect(screen.getByText('Lead score maior que 1000')).toBeTruthy();
    expect(screen.getByText('Cidade é igual a São Paulo')).toBeTruthy();
    expect(screen.getByText('Toda a base')).toBeTruthy();

    // A 4ª condição não some: fica na dica do "+1".
    const resumo = screen.getByText('+1');
    expect(resumo.getAttribute('title')).toBe('UF é igual a SP');
  });

  it('a coluna de critérios passa a ser "Principais critérios (regras)"', () => {
    renderView();
    expect(screen.getByRole('columnheader', { name: 'Principais critérios (regras)' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Critérios' })).toBeNull();
  });

  it('origem personalizada aparece como "Segmentado" na linha e no detalhe, com o ícone do selo', () => {
    renderView();
    expect(screen.getByText('Segmentado')).toBeTruthy();
    expect(screen.queryByText('Personalizado')).toBeNull();

    // O mesmo rótulo vale para o detalhe da linha: nada de "Personalizado" num lado só.
    fireEvent.click(screen.getByText('Clientes VIP'));
    expect(screen.getAllByText('Segmentado').length).toBe(2);
    expect(screen.queryByText('Personalizado')).toBeNull();
  });

  it('segmento sem campanha mostra "Nunca usado" e "Sem dados ainda"', () => {
    renderView();
    expect(screen.getByText('Nunca usado')).toBeTruthy();
    expect(screen.getByText('Sem dados ainda')).toBeTruthy();
  });

  it('a coluna "Público relativo" (barra derivada de estimated_count) saiu da tabela', () => {
    renderView();
    expect(screen.getByRole('columnheader', { name: 'Desempenho (última campanha)' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Público relativo' })).toBeNull();
  });
});

describe('X115 — ações da linha da biblioteca', () => {
  it('Duplicar cria a cópia como rascunho e abre a CÓPIA no construtor, não o original', async () => {
    f.duplicate.mockResolvedValue({ ...vip, id: 'seg-copia', name: 'Cópia de Clientes VIP' });
    renderView();

    usarAcaoDa('Clientes VIP', 'Duplicar');

    await waitFor(() => expect(f.duplicate).toHaveBeenCalledTimes(1));
    expect(f.duplicate.mock.calls[0][0]).toMatchObject({ id: 'seg-1', name: 'Clientes VIP' });
    expect(f.update).not.toHaveBeenCalled();

    const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    expect(nome.value).toBe('Cópia de Clientes VIP');
  });

  it('Ativar grava o status oposto ao da linha', async () => {
    f.update.mockResolvedValue({ ...vip, status: 'active' });
    renderView();

    usarAcaoDa('Clientes VIP', 'Ativar');

    await waitFor(() => expect(f.update).toHaveBeenCalledWith({ id: 'seg-1', status: 'active' }));
  });

  it('linha com foco: Enter abre o mesmo detalhe do clique', () => {
    renderView();
    expect(screen.getByText('Selecione um segmento')).toBeTruthy();

    const linha = screen.getByText('Clientes VIP').closest('tr') as HTMLElement;
    expect(linha.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(linha, { key: 'Enter' });

    expect(screen.queryByText('Selecione um segmento')).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar segmento' })).toBeTruthy();
  });
});
