import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X114 (tela 02) — distinção entre BLOQUEIO da guarda e FALHA de aplicação.
 *
 * O painel de resultado do lote tem dois motivos de "não aplicado":
 *  - P0001 (guarda de uso X101) → "Não aplicável";
 *  - qualquer outro código → "Falhou".
 *
 * O teste entra pelo TalkXSegments REAL com o hook REAL (só a rede é mockada) e
 * coloca os DOIS motivos no MESMO lote, ao lado de um item aplicado: se o painel
 * achatar os motivos (tratar todo não aplicado como bloqueio, ou todo bloqueio
 * como falha), o teste falha. É este ramo — a falha que NÃO é bloqueio — que o
 * teste de guarda (feedbackMassa) não cobre.
 */

const f = vi.hoisted(() => ({
  segments: [
    { id: 'seg-ativos', name: 'Ativos Q3', description: '', origin: 'zapp', status: 'active', is_favorite: false, rules: { groups: [] }, estimated_count: 5, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'seg-vip', name: 'VIP', description: '', origin: 'crm360', status: 'active', is_favorite: false, rules: { groups: [] }, estimated_count: 5, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'seg-antiga', name: 'Antiga', description: '', origin: 'custom', status: 'inactive', is_favorite: false, rules: { groups: [] }, estimated_count: 9, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  ],
  // Veredito do servidor por segmento (a RPC devolve uma linha por id).
  veredito: {} as Record<string, { succeeded: boolean; status: string | null; error_code: string | null; error_message: string | null }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'talkx_segment_bulk_action') {
        const ids = (args.p_segment_ids ?? []) as string[];
        const action = args.p_action as string;
        return Promise.resolve({
          data: ids.map((id) => {
            const v = f.veredito[id] ?? { succeeded: true, status: 'archived', error_code: null, error_message: null };
            return {
              segment_id: id, action, succeeded: v.succeeded, status: v.status,
              archived_at: v.succeeded ? '2026-10-13T15:00:00Z' : null,
              tags: null, error_code: v.error_code, error_message: v.error_message,
            };
          }),
          error: null,
        });
      }
      if (name === 'talkx_segment_library_stats') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: { eligible: 0, rows: [], has_more: false, next_after: null }, error: null });
    },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: f.segments, error: null }) }) }),
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

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const caixa = (nome: string) => screen.getByLabelText(`Selecionar ${nome}`) as HTMLInputElement;

async function abrirBiblioteca() {
  wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Ativos Q3')).toBeTruthy());
}

const itemDe = (painel: HTMLElement, nome: string) =>
  within(painel)
    .getAllByTestId('talkx-bulk-item-falho')
    .find((li) => li.textContent?.includes(nome)) as HTMLElement;

describe('TalkXSegments · bloqueio × falha no resultado do lote (X114)', () => {
  it('separa "Não aplicável" (guarda P0001) de "Falhou" (outra falha) no mesmo lote', async () => {
    f.veredito = {
      'seg-ativos': { succeeded: true, status: 'archived', error_code: null, error_message: null },
      'seg-vip': { succeeded: false, status: null, error_code: 'P0001', error_message: 'Segmento em uso pela campanha "Black Friday" (scheduled).' },
      'seg-antiga': { succeeded: false, status: null, error_code: '23503', error_message: 'Não foi possível arquivar este segmento.' },
    };

    await abrirBiblioteca();

    fireEvent.click(caixa('Ativos Q3'));
    fireEvent.click(caixa('VIP'));
    fireEvent.click(caixa('Antiga'));
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));

    const painel = await screen.findByTestId('talkx-bulk-resultado');
    expect(painel.textContent).toContain('1 aplicado');
    expect(painel.textContent).toContain('2 não aplicados');
    expect(within(painel).getAllByTestId('talkx-bulk-item-falho')).toHaveLength(2);

    const vip = itemDe(painel, 'VIP');
    expect(vip.textContent).toContain('Não aplicável');
    expect(vip.textContent).toContain('Black Friday');
    expect(vip.textContent).not.toContain('Falhou');

    const antiga = itemDe(painel, 'Antiga');
    // Falha que NÃO é bloqueio da guarda: aparece como "Falhou", e nunca como
    // bloqueio — os dois motivos não podem ser achatados um no outro.
    expect(antiga.textContent).toContain('Falhou');
    expect(antiga.textContent).toContain('Não foi possível arquivar este segmento.');
    expect(antiga.textContent).not.toContain('Não aplicável');

    // O aplicado não vira linha de falha.
    expect(within(painel).queryByText(/Ativos Q3/)).toBeNull();

    // Sobrou selecionado só o que não entrou, dos dois motivos.
    expect(caixa('VIP').checked).toBe(true);
    expect(caixa('Antiga').checked).toBe(true);
    expect(caixa('Ativos Q3').checked).toBe(false);
  });

  it('lote inteiro recusado: zero aplicados e nenhum item apresentado como sucesso', async () => {
    f.veredito = {
      'seg-vip': { succeeded: false, status: null, error_code: 'P0001', error_message: 'Segmento em uso pela campanha "Black Friday" (scheduled).' },
      'seg-antiga': { succeeded: false, status: null, error_code: 'ERRO', error_message: 'Falha de transporte.' },
    };

    await abrirBiblioteca();

    fireEvent.click(caixa('VIP'));
    fireEvent.click(caixa('Antiga'));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));

    const painel = await screen.findByTestId('talkx-bulk-resultado');
    expect(painel.textContent).toContain('0 aplicados');
    expect(painel.textContent).toContain('2 não aplicados');
    expect(painel.textContent).not.toContain('Todos os itens selecionados foram aplicados');
    expect(within(painel).getAllByTestId('talkx-bulk-item-falho')).toHaveLength(2);
  });
});
