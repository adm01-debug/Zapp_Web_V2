/**
 * TL-029 (F51 / MX01) — o rascunho do monitor NAO tem mais como ir para o worker
 * sem passar pelo `confirm`.
 *
 * O worker `multiplix-send` processa `multiplix_delivery_items` e SO elas. Antes
 * desta correcao, o botao "Iniciar agora" de um rascunho chamava
 * `multiplix-send/start` direto: o status virava 'sending', os destinatarios
 * ficavam pendentes e a fila por itens nunca existia — o disparo nao enviava nada
 * e nao concluia (MX01). O caminho agora e o `confirm` da edge
 * `multiplix-dispatch`: revalida (F49), congela publico/blocos e materializa a
 * fila NA MESMA transacao (RPC `multiplix_confirm_dispatch`), idempotente por
 * `(dispatch_id, dispatch_version)`.
 *
 * O mock e do CLIENTE Supabase (nao do hook): o teste exercita o MESMO caminho da
 * tela — componente real -> `useConfirmMultiplixDispatch` -> edge — e prova a
 * acao que sai no corpo do POST.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authGetSession = vi.fn();
const functionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => authGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    // O monitor abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';
import { toast } from 'sonner';
import type { MultiplixDispatch } from '@/hooks/integrations/useMultiplixDispatches';

interface InvokeCall {
  fn: string;
  body: { action?: string; dispatchId?: string; payload?: Record<string, unknown> };
}

function dispatchRow(over: Partial<MultiplixDispatch> = {}): MultiplixDispatch {
  return {
    id: 'd1',
    name: 'Disparo em rascunho',
    message_template: 'oi',
    status: 'draft',
    dispatch_version: 3,
    total_recipients: 2,
    sent_count: 0,
    failed_count: 0,
    delivered_count: 0,
    outcome_unknown_count: 0,
    started_at: null,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: '2026-10-07T10:00:00Z',
    ...over,
  };
}

let dispatch: MultiplixDispatch;
let calls: InvokeCall[];
/** Quantas vezes o "servidor" ja materializou a fila desta versao revisada. */
let confirmCount: number;
/** Codigos nomeados da revalidacao (F49) que o proximo confirm deve devolver. */
let confirmFailures: string[];

const confirmCalls = () =>
  calls.filter((c) => c.fn === 'multiplix-dispatch' && c.body.action === 'confirm');
const sendCalls = () => calls.filter((c) => c.fn === 'multiplix-send');

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatch = dispatchRow();
  calls = [];
  confirmCount = 0;
  confirmFailures = [];
  authGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });

  functionsInvoke.mockImplementation((fn: string, options: { body: InvokeCall['body'] }) => {
    const body = options.body;
    calls.push({ fn, body });

    if (fn === 'multiplix-send') {
      return Promise.resolve({ data: { success: true, status: 'sending' }, error: null });
    }
    if (body.action === 'dispatch.list') {
      return Promise.resolve({ data: { data: { rows: [dispatch], total: 1 } }, error: null });
    }
    if (body.action === 'recipients.list') {
      return Promise.resolve({ data: { data: { rows: [], total: 0 } }, error: null });
    }
    if (body.action === 'confirm') {
      const failure = confirmFailures.shift();
      if (failure) {
        const context = new Response(JSON.stringify({ error: failure }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
        return Promise.resolve({
          data: null,
          error: { message: 'Edge Function returned a non-2xx status code', context },
        });
      }
      // A RPC e idempotente por (dispatch_id, dispatch_version): o 1o POST
      // materializa a fila, os repetidos acham a MESMA versao ja confirmada e
      // devolvem `created: false` (a fila nao e criada duas vezes).
      const created = confirmCount === 0;
      confirmCount += 1;
      return Promise.resolve({
        data: {
          data: {
            dispatch_id: body.payload?.dispatch_id ?? null,
            dispatch_version: Number(body.payload?.dispatch_version ?? 0) + 1,
            status: 'sending',
            scheduled_at: null,
            recipient_count: 2,
            block_count: 1,
            items_created: created ? 2 : 0,
            items_total: 2,
            message_count: 2,
            created,
          },
        },
        error: null,
      });
    }
    return Promise.reject(new Error(`acao inesperada: ${String(body.action)}`));
  });
});

/** Clica em "Iniciar/Retomar" e confirma na acao do AlertDialog. */
async function confirmarNoDialogo(acionLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: /^(Iniciar|Retomar)$/ }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: acionLabel }));
}

describe('MultiplixMonitor — rascunho se inicia pelo confirm (F51/MX01)', () => {
  it('Iniciar agora de um rascunho chama a acao `confirm` com a versao revisada e NAO o worker', async () => {
    render(<MultiplixMonitor dispatchId="d1" onBack={() => {}} />, { wrapper: createWrapper() });
    await screen.findByText('Disparo em rascunho');

    await confirmarNoDialogo('Iniciar agora');

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    expect(confirmCalls()[0]?.body.payload).toEqual({ dispatch_id: 'd1', dispatch_version: 3 });
    // O caminho antigo (multiplix-send/start sem confirm) nao pode voltar: era ele
    // que deixava o disparo em 'sending' com a fila vazia.
    expect(sendCalls()).toHaveLength(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('cliques repetidos mandam a MESMA versao revisada: a RPC materializa uma vez so', async () => {
    render(<MultiplixMonitor dispatchId="d1" onBack={() => {}} />, { wrapper: createWrapper() });
    await screen.findByText('Disparo em rascunho');

    // 5 cliques do operador, o mock devolve o mesmo rascunho revisado a cada ciclo
    // (o que se mede aqui e o que o cliente manda; a idempotencia da RPC —
    // 5 POSTs = 1 confirmacao — e provada em
    // supabase/functions/multiplix-dispatch/actions/__tests__/lifecycle.test.ts).
    for (let i = 0; i < 5; i++) {
      await confirmarNoDialogo('Iniciar agora');
      await waitFor(() => expect(confirmCalls()).toHaveLength(i + 1));
    }

    expect(confirmCalls().map((c) => c.body.payload?.dispatch_version)).toEqual([3, 3, 3, 3, 3]);
    expect(sendCalls()).toHaveLength(0);
    // Nenhum clique repetido virou erro na tela (created:false e sucesso).
    expect(toast.error).not.toHaveBeenCalled();
    expect(confirmCount).toBe(5);
  });

  it('retomar um disparo pausado continua pelo worker: nao confirma o que ja tem fila', async () => {
    dispatch = dispatchRow({ status: 'paused', dispatch_version: 5 });
    render(<MultiplixMonitor dispatchId="d1" onBack={() => {}} />, { wrapper: createWrapper() });
    await screen.findByText('Disparo em rascunho');

    await confirmarNoDialogo('Retomar');

    await waitFor(() => expect(sendCalls()).toHaveLength(1));
    expect(sendCalls()[0]?.body).toEqual({ dispatchId: 'd1', action: 'start' });
    expect(confirmCalls()).toHaveLength(0);
  });

  it('revalidacao (F49) recusada explica o motivo na tela em vez de iniciar em silencio', async () => {
    confirmFailures = ['multiplix_confirm_no_blocks'];
    render(<MultiplixMonitor dispatchId="d1" onBack={() => {}} />, { wrapper: createWrapper() });
    await screen.findByText('Disparo em rascunho');

    await confirmarNoDialogo('Iniciar agora');

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toContain('bloco de mensagem');
    expect(sendCalls()).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
