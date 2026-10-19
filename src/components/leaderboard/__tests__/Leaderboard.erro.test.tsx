import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Ranking — matriz de estados: "a leitura falhou" ≠ "o ranking está vazio".
 *
 * Antes, `useLeaderboard` engolia o erro no catch (só `log.error`) e a tela decidia tudo
 * por `agents.length === 0`: com a RPC caída, o agente via "Nenhum agente no ranking
 * ainda" — um vazio que MENTE (parece estado normal do produto) e não oferece como
 * tentar de novo. Este teste monta a TELA real (`Leaderboard` + hook real) contra um
 * cliente Supabase controlado e prova os dois caminhos.
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { Leaderboard } from '../Leaderboard';

/** Resposta da RPC com erro: é o formato que o hook recebe quando a leitura falha. */
const rpcComErro = { data: null, error: { message: 'permission denied for function get_leaderboard' } };
/** Resposta da RPC bem-sucedida e sem ninguém no ranking (o vazio legítimo). */
const rpcVazio = { data: [], error: null };

describe('Leaderboard — estados de erro e vazio', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('leitura que falha mostra o ERRO com "Tentar de novo", nunca o vazio do ranking', async () => {
    rpcMock.mockResolvedValue(rpcComErro);

    const { container } = render(<Leaderboard />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Não foi possível carregar o ranking')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeTruthy();

    // O vazio do produto não aparece no estado de erro — era o defeito.
    expect(screen.queryByText('Nenhum agente no ranking ainda')).toBeNull();
    expect(container.querySelector('[data-leaderboard-state="empty"]')).toBeNull();
    expect(container.querySelector('[data-leaderboard-state="error"]')).not.toBeNull();
  });

  it('"Tentar de novo" refaz a leitura e, dando certo, some com o erro', async () => {
    rpcMock.mockResolvedValueOnce(rpcComErro).mockResolvedValueOnce(rpcVazio);

    const { container } = render(<Leaderboard />);
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(rpcMock).toHaveBeenCalledTimes(2);
    // Agora sim é o vazio legítimo (a leitura deu certo e não há ninguém).
    expect(screen.getByText('Nenhum agente no ranking ainda')).toBeTruthy();
    expect(container.querySelector('[data-leaderboard-state="empty"]')).not.toBeNull();
  });

  it('leitura bem-sucedida e vazia mostra o vazio normal, sem alerta de erro', async () => {
    rpcMock.mockResolvedValue(rpcVazio);

    render(<Leaderboard />);

    expect(await screen.findByText('Nenhum agente no ranking ainda')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
