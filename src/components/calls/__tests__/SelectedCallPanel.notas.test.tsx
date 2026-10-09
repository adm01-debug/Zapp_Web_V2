import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

/**
 * R2-MOD-013 (P1): a anotacao de chamada acompanhava a troca de linha e podia
 * sobrescrever outra chamada.
 *
 * Precondicao do achado: escrever a anotacao na chamada A e selecionar B no historico
 * enquanto o painel permanece MONTADO (o pai nao da `key` por chamada, entao o estado
 * local sobrevive). Antes, `rascunho` era um estado solto: o texto de A continuava
 * valendo e `salvar` gravava o texto de A no id de B.
 *
 * Aceite:
 *  - depois de editar A e escolher B, salvar NUNCA grava o texto de A no id B;
 *  - o painel mostra as notas reais de B.
 */

const addCallNotes = vi.fn();

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ addCallNotes }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ hasRole: () => true }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'agent-A' }, user: { id: 'auth-A' } }),
}));
// O player puxa gravacao/volume; nao e o alvo do cartao.
vi.mock('../RecordingPlayer', () => ({ RecordingPlayer: () => null }));

import { SelectedCallPanel } from '../SelectedCallPanel';

function chamada(id: string, agentNotes: string): SearchMyCallsRow {
  return {
    id,
    agent_id: 'agent-A',
    agent_notes: agentNotes,
    notes: '',
    answered_at: null,
    answered_by: null,
    channel: 'voip',
    contact_avatar_url: '',
    contact_id: 'contato-1',
    contact_name: 'Contato Sintetico',
    contact_phone: '5511999999999',
    direction: 'outbound',
    end_reason: null,
    ended_at: null,
    peer_name: '',
    peer_number: '5511999999999',
    recording_status: null,
    started_at: '2026-10-05T12:00:00.000Z',
    status: 'completed',
    talk_seconds: 30,
    total_count: 2,
  } as unknown as SearchMyCallsRow;
}

function painel(call: SearchMyCallsRow) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SelectedCallPanel call={call} onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('SelectedCallPanel — anotacao nao acompanha troca de chamada (R2-MOD-013)', () => {
  beforeEach(() => {
    addCallNotes.mockReset();
    addCallNotes.mockResolvedValue(true);
  });

  it('ao trocar de chamada, o painel mostra as notas reais da nova chamada', () => {
    const { rerender } = render(painel(chamada('call-A', 'Original A')));

    fireEvent.change(screen.getByTestId('tel-notes'), { target: { value: 'Draft for A' } });
    expect((screen.getByTestId('tel-notes') as HTMLTextAreaElement).value).toBe('Draft for A');

    rerender(painel(chamada('call-B', 'Original B')));

    // O rascunho de A nao pode vazar para B: a tela mostra as notas reais de B.
    expect((screen.getByTestId('tel-notes') as HTMLTextAreaElement).value).toBe('Original B');
  });

  it('salvar depois de trocar grava as notas de B, nunca o texto de A no id de B', async () => {
    const { rerender } = render(painel(chamada('call-A', 'Original A')));

    fireEvent.change(screen.getByTestId('tel-notes'), { target: { value: 'Draft for A' } });
    rerender(painel(chamada('call-B', 'Original B')));

    fireEvent.click(screen.getByTestId('tel-save-notes'));
    await waitFor(() => expect(addCallNotes).toHaveBeenCalled());

    expect(addCallNotes).not.toHaveBeenCalledWith('call-B', 'Draft for A');
    expect(addCallNotes).toHaveBeenCalledWith('call-B', 'Original B');
  });
});
