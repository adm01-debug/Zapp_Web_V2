import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * TL-135d (X114 · tela 02) — alternador lista/grade e ações em massa.
 *
 * Entra o TalkXSegments REAL (hook real e a lista lateral REAL de X112) e só a
 * fronteira de rede é mockada. O teste prova os dois critérios desta fatia:
 *  1. a biblioteca alterna lista (tabela) e grade, e a grade usa o MESMO cartão
 *     criado em X112 (o `SegmentCard` de `segments/SegmentSideList`): o item da
 *     grade traz a estrela, o menu ⋮ e o checkbox da seleção em massa;
 *  2. a ação em massa chama a RPC guardada UMA vez com a lista da página e mostra
 *     o resultado POR ITEM — o aplicado e o recusado pela guarda de X101, com o
 *     nome da campanha que barrou o item, sem prometer ação no item bloqueado.
 */

const CAMPANHA = 'Black Friday — outubro';

const h = vi.hoisted(() => {
  const segmento = (n: number, over: Record<string, unknown> = {}) => ({
    id: `s${n}`,
    name: `Segmento ${n}`,
    description: null,
    origin: 'zapp' as const,
    status: 'active' as const,
    is_favorite: false,
    rules: { groups: [] },
    estimated_count: 100 + n,
    last_used_at: null,
    created_by: 'user-1',
    tags: [] as string[],
    created_at: '2026-10-01T10:00:00Z',
    updated_at: `2026-10-0${n}T10:00:00Z`,
    creator: { name: 'Ana Silva' },
    ...over,
  });

  const stats = () => ({
    generated_at: '2026-10-09T08:00:00Z',
    timezone: 'America/Sao_Paulo',
    month_start: '2026-10-01',
    total_segments: 3,
    active_this_month: 2,
    active_previous_month: 1,
    active_delta: 1,
    crm360_connected: 0,
    crm360_previous_month: 0,
    crm360_delta: 0,
    conversion: {
      value_pct: null, previous_pct: null, delta_pp: null, has_data: false,
      deliveries: 0, conversions: 0, previous_deliveries: 0, previous_conversions: 0, min_deliveries: 100,
    },
    series: [] as unknown[],
  });

  return {
    SEGMENTOS: [segmento(1), segmento(2), segmento(3)],
    chamadas: [] as { name: string; args: Record<string, unknown> }[],
    respostaBulk: [] as unknown[],
    stats,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.chamadas.push({ name, args });
      if (name === 'talkx_segment_library_stats') return Promise.resolve({ data: h.stats(), error: null });
      if (name === 'talkx_segment_bulk_action') return Promise.resolve({ data: h.respostaBulk, error: null });
      // Audiência (X016) não é o alvo deste teste.
      return Promise.resolve({ data: { eligible: 0, rows: [], has_more: false, next_after: null }, error: null });
    },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: h.SEGMENTOS, error: null }) }) }),
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
import { toast } from 'sonner';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Monta a biblioteca e espera os segmentos chegarem (a consulta é da tela). */
async function montarBiblioteca() {
  wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Segmento 1')).toBeTruthy());
}

beforeEach(() => {
  h.chamadas.length = 0;
  h.respostaBulk = [];
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('TalkXSegments · alternador lista/grade da biblioteca (TL-135d)', () => {
  it('alterna lista (tabela) e grade, e a grade usa o cartão de X112', async () => {
    await montarBiblioteca();

    // Estado de partida: lista em tabela, sem grade.
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Segmentos em grade' })).toBeNull();

    // Critério 1 — "Grade" troca a tabela pelos cartões de X112.
    fireEvent.click(screen.getByTitle('Grade'));
    const grade = await screen.findByRole('list', { name: 'Segmentos em grade' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(grade).getAllByRole('listitem')).toHaveLength(3);
    // O cartão de X112 é o MESMO componente: cada item da grade traz o menu ⋮ do
    // cartão ("Ações de <nome>") e o checkbox da seleção em massa.
    expect(within(grade).getByRole('button', { name: 'Ações de Segmento 1' })).toBeTruthy();
    expect(within(grade).getAllByLabelText(/^Selecionar Segmento \d$/)).toHaveLength(3);

    // Volta para a lista: a tabela governa de novo.
    fireEvent.click(screen.getByTitle('Lista'));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.queryByRole('list', { name: 'Segmentos em grade' })).toBeNull();
  });

  it('seleção em massa no cabeçalho chama a RPC uma vez e mostra o recusado pela guarda', async () => {
    h.respostaBulk = [
      { segment_id: 's1', action: 'deactivate', succeeded: true, status: 'inactive', archived_at: null, tags: [], error_code: null, error_message: null },
      { segment_id: 's2', action: 'deactivate', succeeded: true, status: 'inactive', archived_at: null, tags: [], error_code: null, error_message: null },
      { segment_id: 's3', action: 'deactivate', succeeded: false, status: 'active', archived_at: null, tags: [], error_code: 'P0001', error_message: `Segmento em uso pela campanha "${CAMPANHA}".` },
    ];

    await montarBiblioteca();

    // Antes de escolher nada não existe barra nem resultado na tela.
    expect(screen.queryByRole('region', { name: 'Ações em massa' })).toBeNull();
    expect(screen.queryByRole('status', { name: 'Resultado da ação em massa' })).toBeNull();

    // Checkbox do cabeçalho: seleciona a página inteira (3 segmentos).
    fireEvent.click(screen.getByLabelText('Selecionar todos os segmentos da página'));
    const barra = screen.getByRole('region', { name: 'Ações em massa' });
    expect(barra.textContent).toContain('3 selecionado(s)');

    // Critério 2 — a ação vai pela RPC guardada, com a lista da página.
    fireEvent.click(within(barra).getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(h.chamadas.some((c) => c.name === 'talkx_segment_bulk_action')).toBe(true));
    const chamada = h.chamadas.find((c) => c.name === 'talkx_segment_bulk_action');
    expect(chamada?.args).toEqual({ p_action: 'deactivate', p_segment_ids: ['s1', 's2', 's3'] });

    // Critério 3 — resultado POR ITEM: dois aplicados e o recusado com o motivo
    // (nome da campanha), sem prometer que o item barrado foi alterado.
    const resultado = await screen.findByRole('status', { name: 'Resultado da ação em massa' });
    const linhas = within(resultado).getAllByRole('listitem');
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('Segmento 1');
    expect(linhas[0].textContent).toContain('aplicado');
    const recusado = linhas.find((li) => li.textContent?.includes('Segmento 3'));
    expect(recusado?.textContent).toContain('não aplicado');
    expect(recusado?.textContent).toContain(CAMPANHA);

    // A seleção é limpa depois da ação e a barra sai de cena.
    expect(screen.queryByRole('region', { name: 'Ações em massa' })).toBeNull();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('2 aplicado(s) e 1 recusado(s) pela guarda de uso.');
  });

  it('a grade também seleciona em massa: o checkbox do cartão alimenta a mesma barra', async () => {
    h.respostaBulk = [
      { segment_id: 's2', action: 'activate', succeeded: true, status: 'active', archived_at: null, tags: [], error_code: null, error_message: null },
    ];

    await montarBiblioteca();
    fireEvent.click(screen.getByTitle('Grade'));
    const grade = await screen.findByRole('list', { name: 'Segmentos em grade' });

    fireEvent.click(within(grade).getByLabelText('Selecionar Segmento 2'));
    const barra = screen.getByRole('region', { name: 'Ações em massa' });
    expect(barra.textContent).toContain('1 selecionado(s)');

    fireEvent.click(within(barra).getByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(h.chamadas.some((c) => c.name === 'talkx_segment_bulk_action')).toBe(true));
    expect(h.chamadas.find((c) => c.name === 'talkx_segment_bulk_action')?.args)
      .toEqual({ p_action: 'activate', p_segment_ids: ['s2'] });
  });
});
