/**
 * Cartão t_549f87e1 (PM-02) — a TELA de filas passa a usar a métrica REAL da RPC
 * `rpc_queue_goal_metrics()`, não a conta inventada no front.
 *
 * Prova do defeito (vermelho antes, verde depois): a fila q1 tem `waiting_count` (contagem de
 * contatos que o hook de filas calcula) igual a 0 e, ao mesmo tempo, a RPC responde
 * `waiting_contacts: 15`. Antes desta entrega o alerta de espera só olhava `waiting_count` e a
 * conta `membros_ativos / (membros_ativos + aguardando)` — com contagem 0 nada aparecia (o alerta
 * sumia) e a taxa de atribuição era inventada como 100 %. Com a RPC, os dois alertas aparecem com
 * o número medido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockQueues = [
  { id: 'q1', name: 'Suporte', color: '#3B82F6', is_active: true, max_wait_time_minutes: 30, priority: 1, description: null, created_at: '', updated_at: '' },
];

const mockGoals = [
  { id: 'g1', queue_id: 'q1', max_waiting_contacts: 10, max_avg_wait_minutes: 15, min_assignment_rate: 80, max_messages_pending: 50, alerts_enabled: true },
];

// A RPC devolve a métrica REAL: 15 aguardando (limite 10) e taxa de atribuição de 20 % (mínimo 80 %).
// `avg_wait_minutes` e `messages_pending` vêm NULL de propósito (não medidos nesta fila): NULL não
// pode virar alerta.
const mockMetrics = vi.hoisted(() => [
  {
    queue_id: 'q1',
    queue_name: 'Suporte (nome real da RPC)',
    coverage: 'completa',
    contacts_open: 15,
    waiting_contacts: 15,
    avg_wait_minutes: null,
    assignment_rate: 20,
    received_contacts: 20,
    assigned_contacts: 4,
    messages_pending: null,
  },
]);

// waiting_count do hook de filas: ZERO. É justamente o valor que escondia o alerta antes.
const mockWaitingCounts: Record<string, number> = { q1: 0 };

function contactsCountBuilder(queueIdRef: { id: string }) {
  return {
    eq: vi.fn((column: string, value: unknown) => {
      if (column === 'queue_id') queueIdRef.id = String(value);
      return contactsCountBuilder(queueIdRef);
    }),
    is: vi.fn(() => contactsCountBuilder(queueIdRef)),
    not: vi.fn(() => Promise.resolve({ count: mockWaitingCounts[queueIdRef.id] ?? 0, error: null })),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: mockMetrics, error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'queues') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: mockQueues, error: null }) }) };
      }
      if (table === 'queue_members') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'queue_goals') {
        return { select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }) };
      }
      if (table === 'contacts') {
        return { select: vi.fn(() => contactsCountBuilder({ id: '' })) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/queues/CreateQueueDialog', () => ({ CreateQueueDialog: () => null }));
vi.mock('@/components/queues/AddMemberDialog', () => ({ AddMemberDialog: () => null }));
vi.mock('@/components/queues/QueueGoalsDialog', () => ({ QueueGoalsDialog: () => null }));

import { QueuesView } from '@/components/queues/QueuesView';

describe('QueuesView — alertas vêm da RPC de métricas, não de conta inventada (PM-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o alerta de espera mesmo com waiting_count 0, usando o valor medido pela RPC', async () => {
    render(
      <MemoryRouter>
        <QueuesView />
      </MemoryRouter>
    );

    // Com a conta antiga (waiting_count = 0) este alerta NÃO existia.
    await waitFor(() => {
      expect(screen.getByText('15 contatos aguardando atendimento')).toBeInTheDocument();
    });
    expect(screen.getByText('Alertas Ativos (2)')).toBeInTheDocument();
  });

  it('usa o nome da fila e a taxa de atribuição que a RPC devolveu', async () => {
    render(
      <MemoryRouter>
        <QueuesView />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Taxa de atribuição em 20% (mínimo 80%)')).toBeInTheDocument();
    });
    // Métricas NULL (espera e mensagens pendentes) ficam de fora — nada de alerta inventado.
    expect(screen.queryByText(/Espera média/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mensagens sem resposta/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Dispensar alerta / })).toHaveLength(2);
  });
});
