import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * TL-054/3 (X051) — o Monitor (TalkXLiveMonitor) resolve pausar / retomar /
 * cancelar pelo controlador ÚNICO de ciclo de vida (`useTalkXLifecycle`): a tela
 * não tem mais `AlertDialog` próprio nem os estados `confirmPause`,
 * `pauseReason`, `confirmCancel` e `confirmResume`.
 *
 * O teste renderiza o componente REAL com o hook REAL (só `useTalkX`, a porta
 * das operações, é espiado) e clica nos botões como o usuário clica. O que prova
 * a troca é o comportamento que só o diálogo do kit tem:
 *  - o confirmar fica PENDENTE com o rótulo do kit e trava os dois botões —
 *    o diálogo local fechava/ficava quieto e não tinha estado pendente;
 *  - erro da Edge não vira saída silenciosa nem toast: o diálogo do kit segue
 *    aberto com `role="alert"` (antes o `catch` só chamava `toast.error`);
 *  - o cancelar usa o texto do kit ("Cancelar" / "Voltar"), e não o
 *    "Cancelar campanha" local;
 *  - `startCampaign` devolvendo `false` (Edge recusou) aparece como erro no
 *    diálogo aberto (antes o `if (!started) return` deixava o diálogo parado).
 */

const h = vi.hoisted(() => ({
  status: 'sending' as string,
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const campanha = () => ({
    id: 'camp-1',
    name: 'Campanha Monitor X051',
    status: h.status,
    message_template: 'mensagem de teste',
    total_recipients: 10,
    sent_count: 3,
    delivered_count: 2,
    failed_count: 1,
    outcome_unknown_count: 0,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
  });

  const resolveChain = (table: string, id: string | null) => {
    if (table === 'talkx_campaigns') {
      if (id !== 'camp-1') return Promise.resolve({ data: null, error: new Error('campanha inesperada: ' + id) });
      return Promise.resolve({ data: campanha(), error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const makeChain = (table: string) => {
    let id: string | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { if (col === 'id') id = String(value); return chain; };
    chain.order = () => chain;
    chain.limit = () => resolveChain(table, id);
    chain.single = () => resolveChain(table, id);
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

/** Porta real das operações: o hook único do lifecycle passa por aqui. */
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
    updateCampaign: h.updateCampaign,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({ rateByMinute: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';

function renderMonitor(status: string) {
  h.status = status;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** Abre a tela e espera a campanha carregada (o cabeçalho traz o nome). */
async function abrirMonitor(status: string) {
  renderMonitor(status);
  await screen.findByText('Campanha Monitor X051');
}

const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Monitor — ciclo de vida pelo controlador único (X051)', () => {
  it('pausar: o confirmar do kit fica pendente (botões travados) e o motivo digitado chega em pauseCampaign', async () => {
    let liberar: (v: unknown) => void = () => {};
    h.pauseCampaign.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );
    await abrirMonitor('sending');

    clicar('Pausar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Pausar campanha?');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    fireEvent.change(within(dialogo).getByPlaceholderText('Motivo da pausa (opcional)'), {
      target: { value: 'ensaio de pausa' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pausar agora' }));

    await waitFor(() => expect(h.pauseCampaign).toHaveBeenCalledWith('camp-1', 'ensaio de pausa'));
    const pendente = await within(dialogo).findByRole('button', { name: /Pausando/ });
    expect(pendente).toHaveProperty('disabled', true);
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveProperty('disabled', true);

    liberar({ data: null, error: null });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('pausar com erro da Edge: o diálogo do kit continua aberto com o alerta, sem engolir a falha', async () => {
    h.pauseCampaign.mockRejectedValue(new Error('Edge talkx-send recusou a pausa'));
    await abrirMonitor('sending');

    clicar('Pausar');
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pausar agora' }));

    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('Edge talkx-send recusou a pausa'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
    expect(h.pauseCampaign).toHaveBeenCalledWith('camp-1', undefined);
  });

  it('cancelar: o diálogo é o do kit — ação "Cancelar", saída "Voltar", nenhum "Cancelar campanha" próprio', async () => {
    h.cancelCampaign.mockResolvedValue(undefined);
    await abrirMonitor('sending');

    clicar('Cancelar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Cancelar campanha?');
    expect(within(dialogo).queryByRole('button', { name: 'Cancelar campanha' })).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Voltar' })).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(h.cancelCampaign).toHaveBeenCalledWith('camp-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('retomar: o hook executa startCampaign e a recusa da Edge (false) aparece como erro no diálogo aberto', async () => {
    h.startCampaign.mockResolvedValue(false);
    await abrirMonitor('paused');

    clicar('Retomar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Retomar campanha?');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(h.startCampaign).toHaveBeenCalledWith('camp-1'));
    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('O envio não foi aceito'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
  });

  it('a saída "Voltar" fecha o diálogo sem disparar ação nenhuma', async () => {
    await abrirMonitor('sending');

    clicar('Cancelar');
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.cancelCampaign).not.toHaveBeenCalled();
    expect(h.pauseCampaign).not.toHaveBeenCalled();
    expect(h.startCampaign).not.toHaveBeenCalled();
  });
});
