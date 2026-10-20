import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X114 (tela 02) — feedback das ações em massa na biblioteca de segmentos.
 *
 * A prova entra pelo TalkXSegments REAL com o hook REAL: só a fronteira de rede
 * (a RPC guardada e a leitura dos segmentos) é mockada. O resultado do lote vem
 * POR SEGMENTO, como a RPC devolve, e a tela tem de:
 *  1. separar aplicados de não aplicados no resumo;
 *  2. detalhar item a item o que NÃO foi aplicado;
 *  3. item barrado pela guarda de uso (P0001) aparecer como NÃO APLICÁVEL —
 *     nunca como sucesso nem contar entre os aplicados;
 *  4. manter selecionado só o que falhou, para conferir/refazer.
 */

const f = vi.hoisted(() => ({
  segments: [
    { id: 'seg-ativos', name: 'Ativos Q3', description: '', origin: 'zapp', status: 'active', is_favorite: false, rules: { groups: [] }, estimated_count: 5, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'seg-vip', name: 'VIP', description: '', origin: 'crm360', status: 'active', is_favorite: false, rules: { groups: [] }, estimated_count: 5, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'seg-antiga', name: 'Antiga', description: '', origin: 'custom', status: 'inactive', is_favorite: false, rules: { groups: [] }, estimated_count: 9, last_used_at: null, created_by: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  ],
  chamadasRpc: [] as { name: string; args: Record<string, unknown> }[],
  // A guarda de uso roda NO SERVIDOR: o segmento em campanha ativa volta P0001.
  bloqueados: ['seg-vip'] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      f.chamadasRpc.push({ name, args });
      if (name === 'talkx_segment_bulk_action') {
        const ids = (args.p_segment_ids ?? []) as string[];
        const action = args.p_action as string;
        return Promise.resolve({
          data: ids.map((id) => f.bloqueados.includes(id)
            ? { segment_id: id, action, succeeded: false, status: null, archived_at: null, tags: null, error_code: 'P0001', error_message: 'Segmento em uso pela campanha "Black Friday" (scheduled).' }
            : { segment_id: id, action, succeeded: true, status: 'archived', archived_at: '2026-10-13T15:00:00Z', tags: null, error_code: null, error_message: null }),
          error: null,
        });
      }
      // KPIs da biblioteca fora do alvo deste teste.
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

describe('TalkXSegments · feedback das ações em massa (X114)', () => {
  it('separa aplicados de não aplicados e detalha o item barrado pela guarda', async () => {
    await abrirBiblioteca();

    fireEvent.click(caixa('Ativos Q3'));
    fireEvent.click(caixa('VIP'));
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));

    const painel = await screen.findByTestId('talkx-bulk-resultado');
    // O lote foi por segmento: 1 aplicado, 1 não aplicado — o bloqueado NUNCA
    // entra na conta dos aplicados.
    expect(painel.textContent).toContain('1 aplicado');
    expect(painel.textContent).toContain('1 não aplicado');

    const falhas = within(painel).getAllByTestId('talkx-bulk-item-falho');
    expect(falhas).toHaveLength(1);
    expect(falhas[0].textContent).toContain('VIP');
    expect(falhas[0].textContent).toContain('Não aplicável');
    expect(falhas[0].textContent).toContain('Black Friday');

    // Quem foi aplicado não aparece na lista de falhos (nem como sucesso, nem
    // como falha): o detalhamento é só do que não entrou.
    expect(within(painel).queryByText(/Ativos Q3/)).toBeNull();

    // A tela pediu a ação em massa pela RPC guardada, com os ids selecionados.
    expect(f.chamadasRpc).toContainEqual({
      name: 'talkx_segment_bulk_action',
      args: { p_action: 'archive', p_segment_ids: ['seg-ativos', 'seg-vip'] },
    });

    // Sobrou selecionado só o que falhou: dá para conferir e refazer.
    expect(caixa('VIP').checked).toBe(true);
    expect(caixa('Ativos Q3').checked).toBe(false);
  });

  it('lote inteiro aplicado: resumo só de sucesso e nenhum item falho listado', async () => {
    await abrirBiblioteca();

    fireEvent.click(caixa('Ativos Q3'));
    fireEvent.click(caixa('Antiga'));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));

    const painel = await screen.findByTestId('talkx-bulk-resultado');
    expect(painel.textContent).toContain('2 aplicados');
    expect(painel.textContent).not.toContain('não aplicado');
    expect(within(painel).queryAllByTestId('talkx-bulk-item-falho')).toHaveLength(0);
    expect(painel.textContent).toContain('Todos os itens selecionados foram aplicados');

    // Nada falhou: a seleção é liberada.
    expect(caixa('Ativos Q3').checked).toBe(false);
    expect(caixa('Antiga').checked).toBe(false);
  });

  it('a barra de seleção anuncia o total e "Limpar seleção" esvazia a escolha', async () => {
    await abrirBiblioteca();

    fireEvent.click(screen.getByLabelText('Selecionar todos os segmentos da página'));
    expect(screen.getByText('3 selecionadas')).toBeTruthy();
    expect(caixa('VIP').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.queryByText('3 selecionadas')).toBeNull();
    expect(caixa('VIP').checked).toBe(false);
  });
});
