/**
 * R2-QUE-002 (item 106 / P1) — prova de ponta a ponta no consumidor real:
 * QueuesView monta com o useQueues REAL (nao mockado) sobre um supabase mockado
 * que devolve count real por fila. Antes da correcao, useQueues forcava
 * waiting_count = 0 e o alerta configurado ("mais de N contatos aguardando")
 * nunca aparecia; com a contagem real, o alerta dispara para a fila acima do
 * limite e nao dispara para a fila zerada.
 *
 * N086 — ordem de cabecalhos e nome do botao de dispensar alerta:
 *  - 'Alertas Ativos' e uma SECAO da pagina logo abaixo do h1 do PageHeader
 *    (PageHeader.tsx:148) e acima dos h3 dos CardTitle dos cartoes (card.tsx:93).
 *    Logo o nivel correto e h2 (h1 -> h2 -> h3, sem pular nivel).
 *  - o botao X (QueueAlertsDisplay.tsx) nao tinha nome; passa a ter
 *    "Dispensar alerta <tipo>".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router-dom';

// Métrica REAL que a RPC `rpc_queue_goal_metrics()` devolve (cartão t_549f87e1). Desde PM-02 os
// alertas da tela saem destes valores, e não mais da conta `membros ativos / aguardando`.
const mockMetrics = vi.hoisted(() => [
  { queue_id: 'q1', queue_name: 'Suporte', coverage: 'completa', contacts_open: 15, waiting_contacts: 15, avg_wait_minutes: null, assignment_rate: 20, received_contacts: 20, assigned_contacts: 4, messages_pending: null },
  { queue_id: 'q2', queue_name: 'Vendas', coverage: 'completa', contacts_open: 0, waiting_contacts: 0, avg_wait_minutes: null, assignment_rate: 100, received_contacts: 0, assigned_contacts: 0, messages_pending: 0 },
]);

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
    rpc: vi.fn().mockResolvedValue({ data: mockMetrics, error: null }),
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

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
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

  it('mantem a ordem de cabecalhos (h1->h2->h3) e da nome ao botao de dispensar por tipo', async () => {
    const { container } = renderView();

    await waitFor(() => {
      expect(screen.getByText('Alertas Ativos (2)')).toBeInTheDocument();
    });

    // Causa 1 — nivel do titulo: 'Alertas Ativos' e secao da pagina (h2), nao h3.
    // O h1 vem do PageHeader (PageHeader.tsx:148) e os titulos dos cartoes sao h3
    // (CardTitle, card.tsx:93); logo a secao fica em h2.
    const alertasHeading = screen.getByText('Alertas Ativos (2)').closest('h2');
    expect(alertasHeading).toBeTruthy();

    // Ordem real de TODOS os cabecalhos renderizados: nenhum nivel sobe mais de 1.
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1); // existe o h1 da pagina
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
    // 'Alertas Ativos' (h2) aparece antes dos titulos dos cartoes (h3).
    expect(levels.indexOf(2)).toBeGreaterThanOrEqual(0);
    expect(levels.indexOf(3)).toBeGreaterThan(levels.indexOf(2));

    // Causa 2 — nome acessivel: cada tipo de alerta da nome proprio ao botao X.
    expect(screen.getByRole('button', { name: 'Dispensar alerta contatos aguardando' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dispensar alerta taxa de atribuição' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Dispensar alerta / })).toHaveLength(2);

    // axe — ordem de cabecalhos sem violacao.
    const results = await axe(container);
    const headingOrder = results.violations.filter((v) => v.id === 'heading-order');
    expect(headingOrder).toHaveLength(0);

    // axe — o subtree dos alertas nao tem botao sem nome (os botoes de dispensar
    // agora tem nome; o cartao de fila tem outros botoes fora deste escopo).
    const alertsRegion = screen.getByText('Alertas Ativos (2)').parentElement!;
    const alertResults = await axe(alertsRegion, { rules: { 'button-name': { enabled: true } } });
    const buttonName = alertResults.violations.filter((v) => v.id === 'button-name');
    expect(buttonName).toHaveLength(0);
  });
});
