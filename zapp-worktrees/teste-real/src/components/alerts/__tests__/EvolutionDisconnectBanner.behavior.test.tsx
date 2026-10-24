import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';

/**
 * R2-API-042 (BACKLOG_VERIFICADO #216): a Edge Function `evolution-api` usa HTTP 200
 * também nas falhas LÓGICAS — o erro vem no CORPO (`{ error: true, message }`), não no
 * campo `error` do `functions.invoke`. O banner olhava só o erro de transporte e anunciava
 * "Reconectando..." como se a solicitação tivesse sido aceita.
 *
 * Estes testes exercitam o botão REAL do banner e olham o que é anunciado ao usuário.
 */
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: h.rows }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
    functions: { invoke: h.invoke },
  },
}));

vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

const desconectada = { id: 'c1', instance_id: 'PRINCIPAL', phone_number: null, status: 'disconnected' };

async function clicarReconectar() {
  const { findByRole } = render(<EvolutionDisconnectBanner />);
  const botao = await findByRole('button', { name: /reconectar/i });
  fireEvent.click(botao);
}

describe('EvolutionDisconnectBanner — reconexão distingue erro lógico de sucesso', () => {
  beforeEach(() => {
    h.rows = [desconectada];
    h.invoke.mockReset();
    h.toastSuccess.mockReset();
    h.toastError.mockReset();
  });

  it('erro lógico no corpo (data.error) exibe o aviso de erro e NUNCA o de sucesso', async () => {
    h.invoke.mockResolvedValue({ data: { error: 'falha' }, error: null });

    await clicarReconectar();

    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('erro de transporte (error) exibe o aviso de erro e NUNCA o de sucesso', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });

    await clicarReconectar();

    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('resposta sem erro lógico nem de transporte exibe o aviso de reconexão iniciada', async () => {
    h.invoke.mockResolvedValue({ data: { status: 'connecting' }, error: null });

    await clicarReconectar();

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess.mock.calls[0][0]).toMatch(/reconectando/i);
    expect(h.toastError).not.toHaveBeenCalled();
  });
});
