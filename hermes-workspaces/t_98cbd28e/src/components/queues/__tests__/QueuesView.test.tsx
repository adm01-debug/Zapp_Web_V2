/**
 * R2-QUE-002 (item 106 / P1) — prova de ponta a ponta no consumidor real:
 * QueuesView monta com o useQueues REAL (nao mockado) sobre um supabase mockado
 * que devolve count real por fila. Antes da correcao, useQueues forcava
 * waiting_count = 0 e o alerta configurado ("mais de N contatos aguardando")
 * nunca aparecia; com a contagem real, o alerta dispara para a fila acima do
 * limite e nao dispara para a fila zerada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockQueues = [
  { id: 'q1', name: 'Suporte', color: '#3B82F6', is_active: true, max_wait_time_minutes: 30, priority: 1, description: null, created_at: '', updated_at: '' },
  { id: 'q2', name: 'Vendas', color: '#10B981', is_active: true, max_wait_time_minutes: 15, priority: 2, description: null, created_at: '', updated_at: '' },
];

const mockMembers = [
  { id: 'm1', queue_id: 'q1', profile_id: 'p1', is_active: true, created_at: '', profile: { id: 'p1', name: 'Agent 1', avatar_url: null, is_active: true } },
];

// Meta da fila q1: alerta quando houver MAIS de 10 contatos aguardando.
const mockGoals = [
  { id: 'g1', queue_id: 'q1', max_waiting_contacts: 10, max_avg_wait_minutes: 15, min_assignment_rate: 80, max_messages_pending: 50, alerts_enabled: true },
];

const mockWaitingCounts: Record<string, number> = { q1: 15, q2: 0 };

function contactsCountBuilder(queueIdRef: { id: string }) {
  return {
    eq: vi.fn((column: string, value: unknown) => {
      if (column === 'queue_id') queueIdRef.id = String(value);
      return contactsCountBuilder(queueIdRef);
    }),
    is: vi.fn(() => contactsCountBuilder(queueIdRef)),
    not: vi.fn(() =>
      Promise.resolve({ count: mockWaitingCounts[queueIdRef.id] ?? 0, error: null }),
    ),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockQueues, error: null }),
          }),
        };
      }
      if (table === 'queue_members') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
      }
      if (table === 'queue_goals') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn(() => contactsCountBuilder({ id: '' })),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/queues/CreateQueueDialog', () => ({ CreateQueueDialog: () => null }));
vi.mock('@/components/queues/AddMemberDialog', () => ({ AddMemberDialog: () => null }));
vi.mock('@/components/queues/QueueGoalsDialog', () => ({ QueueGoalsDialog: () => null }));

import { QueuesView } from '@/components/queues/QueuesView';

function renderView() {
  return render(
    <MemoryRouter>
      <QueuesView />
    </MemoryRouter>
  );
}

describe('QueuesView — alertas de fila usam a contagem real de espera (R2-QUE-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispara o alerta de espera para a fila acima do limite e ignora a fila zerada', async () => {
    renderView();

    // A fila q1 tem 15 aguardando contra o limite de 10 -> alerta visivel.
    // (Com waiting_count = 0 do defeito, nada aparece aqui.)
    await waitFor(() => {
      expect(screen.getByText(/15 contatos aguardando atendimento/)).toBeInTheDocument();
    });

    // Fila q2 tem 0 aguardando -> nenhum alerta de espera dela.
    expect(screen.getAllByText(/contatos aguardando atendimento/)).toHaveLength(1);

    // q1 tambem estoura a taxa minima de atribuicao (cabecalho conta 2 alertas).
    expect(screen.getByText('Alertas Ativos (2)')).toBeInTheDocument();

    // O cartao da fila mostra a contagem real (nao mais 0).
    expect(screen.getAllByText('Aguardando')).toHaveLength(2);
    expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(2);
  });
});
