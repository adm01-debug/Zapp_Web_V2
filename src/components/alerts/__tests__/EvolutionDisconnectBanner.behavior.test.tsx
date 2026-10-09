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

/**
 * SL-076 (BUG-2 do inventário, PLANO_SEGUNDA_LEVA_CARTOES_2026-10-08): a faixa era
 * `fixed top-0 left-0 right-0 z-[90]` e cobria 44 dos 53px da barra de abas do inbox (83%),
 * engolindo os cliques de SalesView/Journey — o Playwright registrou `subtree intercepts pointer
 * events` em 19 tentativas seguidas (docs/design/salesview-journey/VERIFICACAO_S38_S41_S42_S43_2026-10-02.md §2).
 *
 * jsdom não calcula layout, então a prova aqui é estrutural — a âncora do aviso e a posse do
 * ponteiro. A geometria no navegador real fica por conta de e2e/inbox-contraste.spec.ts, que já
 * monta a faixa com a barra de abas.
 */
describe('EvolutionDisconnectBanner — não cobre nem intercepta a barra de abas (SL-076)', () => {
  beforeEach(() => {
    h.rows = [desconectada];
  });

  it('o aviso não é um overlay no topo: ancora no rodapé, fora da faixa da barra de abas', async () => {
    const { container, findByText } = render(<EvolutionDisconnectBanner />);
    await findByText(/está desconectada/i);

    const faixa = container.querySelector('[role="region"]');
    expect(faixa).toBeTruthy();
    const classes = faixa?.className ?? '';
    // Antes da correção a faixa era `fixed top-0` (top 0 · altura 44px) sobre a barra de abas
    // (top 0 · altura 53px) — cobertas: TRUE.
    expect(classes).not.toMatch(/(^|\s)top-0(\s|$)/);
    expect(classes).toMatch(/(^|\s)bottom-\d/);
  });

  it('não engole o ponteiro: o wrapper é pointer-events-none e só o cartão é pointer-events-auto', async () => {
    const { container, findByText } = render(<EvolutionDisconnectBanner />);
    await findByText(/está desconectada/i);

    const faixa = container.querySelector('[role="region"]');
    expect(faixa?.className).toMatch(/pointer-events-none/);
    const cartao = faixa?.firstElementChild;
    expect(cartao).toBeTruthy();
    expect(cartao?.className).toMatch(/pointer-events-auto/);
  });
});
