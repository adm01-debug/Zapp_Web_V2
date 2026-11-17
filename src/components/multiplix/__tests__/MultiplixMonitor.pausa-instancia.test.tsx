/**
 * C121 — motivo de pausa `instance_paused` em portugues no monitor.
 *
 * DEFEITO: quando o worker pausava o disparo porque a instancia do WhatsApp
 * estava pausada, ele gravava `pause_reason = 'instance_paused'`
 * (supabase/functions/multiplix-send/index.ts) e o monitor caia no texto
 * generico `Pausado automaticamente: ${pause_reason}` — o operador lia o codigo
 * tecnico cru. A retomada e automatica (a migration
 * 20261115020000_multiplix_retoma_instance_paused.sql reabre o disparo quando a
 * instancia volta), entao a frase precisa dizer isso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  dispatchQuery: {
    data: null as unknown,
    isError: false,
    error: null as unknown,
    isFetching: false,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixDispatches', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useMultiplixDispatches')>(
    '@/hooks/integrations/useMultiplixDispatches',
  );
  return {
    MultiplixDispatchEdgeError: actual.MultiplixDispatchEdgeError,
    useMultiplixDispatch: () => ({ ...h.dispatchQuery, refetch: vi.fn() }),
    useMultiplixRecipients: () => ({
      data: { rows: [], total: 0, truncated: false },
      isError: false,
      error: null,
      isPending: false,
    }),
    useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
    fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
    useMultiplixEstimate: () => ({ data: undefined, isError: false }),
  };
});

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

function dispatchPausado(pauseReason: string) {
  return {
    id: 'd1', name: 'Disparo C121', message_template: 'oi', status: 'paused',
    total_recipients: 3, sent_count: 1, failed_count: 0, delivered_count: 0,
    outcome_unknown_count: 0, started_at: '2026-11-15T10:00:00Z',
    paused_at: '2026-11-15T10:05:00Z', pause_reason: pauseReason,
    completed_at: null, created_at: '2026-11-15T09:00:00Z',
  };
}

function renderMonitor(pauseReason: string) {
  h.dispatchQuery = { data: dispatchPausado(pauseReason), isError: false, error: null, isFetching: false };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.dispatchQuery = { data: dispatchPausado('instance_paused'), isError: false, error: null, isFetching: false };
});

describe('MultiplixMonitor — pausa por instancia pausada (C121)', () => {
  it('explica em portugues que a instancia foi pausada e que a retomada e automatica', () => {
    renderMonitor('instance_paused');

    expect(
      screen.getByText(
        'Pausado automaticamente: a instância do WhatsApp foi pausada; o envio retoma sozinho quando ela voltar',
      ),
    ).toBeInTheDocument();
    // O operador nunca le o codigo tecnico do servidor.
    expect(screen.queryByText(/instance_paused/)).toBeNull();
  });

  it('mantem o texto generico para um motivo desconhecido', () => {
    renderMonitor('motivo_novo_do_servidor');

    expect(screen.getByText('Pausado automaticamente: motivo_novo_do_servidor')).toBeInTheDocument();
  });
});
