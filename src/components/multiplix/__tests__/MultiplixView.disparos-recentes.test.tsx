/**
 * #398 — "Monitor Multiplix depende dos cinquenta disparos mais recentes e UI
 * so abre oito".
 *
 * A lista "Disparos recentes" da tela Multiplix busca ate 50 disparos na edge e
 * renderizava apenas os 8 primeiros (`slice(0, 8)`): os demais vinham do
 * servidor e ficavam sem nenhum caminho de clique. Este teste monta a tela REAL
 * (`MultiplixView`) com 12 disparos e prova que o 12o (fora dos 8 antigos) esta
 * na lista E abre o monitor com o id dele.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { dispatches } = vi.hoisted(() => ({
  dispatches: Array.from({ length: 12 }, (_, i) => ({
    id: `d${i + 1}`,
    name: `Disparo ${i + 1}`,
    message_template: 'oi',
    status: 'completed',
    total_recipients: 10,
    sent_count: 10,
    failed_count: 0,
    delivered_count: 0,
    outcome_unknown_count: 0,
    started_at: null,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: `2026-10-01T10:00:${String(i).padStart(2, '0')}Z`,
  })),
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: dispatches, refetch: vi.fn() }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useMultiplixCount: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

// O alvo do teste e a lista de recentes -> qual id a tela manda para o monitor.
vi.mock('@/components/multiplix/MultiplixMonitor', () => ({
  MultiplixMonitor: ({ dispatchId }: { dispatchId: string }) => (
    <div data-testid="monitor">monitor:{dispatchId}</div>
  ),
}));

vi.mock('@/components/multiplix/MultiplixComposerDialog', () => ({
  MultiplixComposerDialog: () => null,
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

describe('MultiplixView — lista "Disparos recentes" (#398)', () => {
  it('mostra TODOS os disparos recebidos da edge, nao so os oito primeiros', () => {
    render(<MultiplixView />);

    expect(screen.getByText('Disparos recentes')).toBeInTheDocument();
    for (const d of dispatches) {
      expect(screen.getByText(d.name)).toBeInTheDocument();
    }
  });

  it('abre o monitor do 12o disparo (fora dos oito) com o id dele', () => {
    render(<MultiplixView />);

    fireEvent.click(screen.getByText('Disparo 12'));

    expect(screen.getByTestId('monitor')).toHaveTextContent('monitor:d12');
  });
});
