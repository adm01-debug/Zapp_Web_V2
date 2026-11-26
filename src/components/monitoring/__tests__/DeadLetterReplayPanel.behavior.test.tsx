/**
 * `DeadLetterReplayPanel` ? painel real (componente + hook) com o client do
 * Supabase mockado, provando pela TELA:
 *  1. a fila da dead-letter aparece (evento, tipo, tentativas, quando falhou);
 *  2. linha sem `replay_payload` e sinalizada e nao conta como "pronta";
 *  3. estado vazio quando a RPC devolve zero linhas;
 *  4. erro de leitura aparece na tela e "Tentar de novo" refaz a chamada;
 *  5. "Reprocessar" chama a edge admin-only com o teto da funcao, mostra o
 *     resumo devolvido e recarrega a fila.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DeadLetterReplayPanel } from '@/components/monitoring/DeadLetterReplayPanel';

const LINHA = {
  id: '11111111-1111-1111-1111-111111111111',
  external_id: 'EVT-1',
  endpoint: 'evolution-webhook',
  event_type: 'messages.upsert',
  retry_count: 3,
  error_at: '2026-11-26T14:00:00.000Z',
  tem_payload: true,
  total: 2,
};

const LINHA_SEM_PAYLOAD = {
  id: '22222222-2222-2222-2222-222222222222',
  external_id: 'EVT-2',
  endpoint: 'evolution-webhook',
  event_type: null,
  retry_count: 1,
  error_at: '2026-11-26T13:00:00.000Z',
  tem_payload: false,
  total: 2,
};

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.rpc.mockResolvedValue({ data: [LINHA, LINHA_SEM_PAYLOAD], error: null });
});

describe('DeadLetterReplayPanel', () => {
  it('mostra a fila com os itens e marca quem nao tem payload de replay', async () => {
    render(<DeadLetterReplayPanel />);

    expect(await screen.findByText('EVT-1')).toBeTruthy();
    expect(screen.getByText('EVT-2')).toBeTruthy();
    expect(screen.getByText('messages.upsert')).toBeTruthy();
    expect(screen.getByText('sem payload')).toBeTruthy();
    expect(screen.getByText(/2 eventos na fila/)).toBeTruthy();
    expect(screen.getByText(/1 sem payload de replay/)).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith('webhook_dead_letter_fila', { p_limit: 50 });
  });

  it('mostra estado vazio quando a fila esta limpa', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    render(<DeadLetterReplayPanel />);

    expect(await screen.findByText('Nenhum evento na fila')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reprocessar/ })).toHaveProperty('disabled', true);
  });

  it('mostra o erro de leitura e refaz a chamada em "Tentar de novo"', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    render(<DeadLetterReplayPanel />);

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/sem permiss/i);

    h.rpc.mockResolvedValue({ data: [LINHA], error: null });
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByText('EVT-1')).toBeTruthy();
  });

  it('reprocessa pela edge admin-only, mostra o resumo e recarrega a fila', async () => {
    h.invoke.mockResolvedValue({
      data: { lidas: 2, reprocessados: 1, resolvidos: 1, falhas: 1, ignorados: 0 },
      error: null,
    });
    render(<DeadLetterReplayPanel />);
    await screen.findByText('EVT-1');

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar \(1\)/ }));

    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    expect(h.invoke).toHaveBeenCalledWith('webhook-replay', { method: 'POST', body: { limit: 50 } });
    expect(await screen.findByText(/Lidos 2: 1 reprocessados, 1 resolvidos, 1 falharam de novo/)).toBeTruthy();
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
  });
});
