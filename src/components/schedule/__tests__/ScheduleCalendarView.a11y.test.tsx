/**
 * N-196 — acessibilidade do Calendário de Agendamentos.
 *
 * Defeito: o filtro de agente (SelectTrigger) não tinha nome acessível e cada
 * botão de cancelar de mensagem agendada era um "Cancelar envio" genérico,
 * repetido sem identificar a mensagem/contato. Este teste prova, no calendário
 * REAL, que (1) o filtro é um combobox com nome, (2) cada botão de cancelar tem
 * nome único derivado do contato/mensagem, e (3) o calendário e o diálogo do dia
 * aberto passam no axe sem violação.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { startOfMonth } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  createScheduledMessagesServer,
  fakeScheduledMessage,
  type ScheduledMessagesServer,
} from '@/test/mocks/scheduledMessagesServer';

const held = vi.hoisted(() => ({ server: null as ScheduledMessagesServer | null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => held.server?.from(table),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], isLoading: false }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'p1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import { ScheduleCalendarView } from '@/components/schedule/ScheduleCalendarView';

const MES = startOfMonth(new Date());
/** Contato do mock — é o único dado de contato que a linha carrega. */
const CONTATO = 'c1';

const pendentes = [
  fakeScheduledMessage({
    id: 'pend-1',
    contact_id: CONTATO,
    content: 'Confirmar entrega do pedido',
    status: 'pending',
    scheduled_at: new Date(MES.getFullYear(), MES.getMonth(), 10, 14, 30).toISOString(),
  }),
  fakeScheduledMessage({
    id: 'pend-2',
    contact_id: CONTATO,
    content: 'Enviar proposta revisada',
    status: 'pending',
    scheduled_at: new Date(MES.getFullYear(), MES.getMonth(), 12, 9, 15).toISOString(),
  }),
];

const LABEL_10 = `Cancelar envio para ${CONTATO} — "Confirmar entrega do pedido" às 14:30`;
const LABEL_12 = `Cancelar envio para ${CONTATO} — "Enviar proposta revisada" às 09:15`;

function renderAgenda() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScheduleCalendarView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const AXE = {
  rules: {
    // jsdom não tem layout: o contraste renderizado é medido no gate do CI, não aqui.
    'color-contrast': { enabled: false },
    // Render isolado do componente: sem <main>/landmarks e sem o <h1> da rota.
    region: { enabled: false },
    'heading-order': { enabled: false },
  },
};

describe('ScheduleCalendarView — acessibilidade (N-196)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    held.server = createScheduledMessagesServer(pendentes);
  });

  it('o filtro de agente é um combobox com nome', async () => {
    renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por agente' })).toBeInTheDocument();
  });

  it('cada botão de cancelar tem nome único com o contato da mensagem', async () => {
    renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();

    // Dia 10: 'Confirmar entrega do pedido' às 14:30.
    fireEvent.click(screen.getByText('10').closest('button')!);
    expect(await screen.findByRole('button', { name: LABEL_10 })).toBeInTheDocument();
    // Não sobra o botão genérico repetido sem identificar a mensagem.
    expect(screen.queryByRole('button', { name: 'Cancelar envio' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });

    // Dia 12: outra mensagem, outro nome — os dois nomes são distintos.
    fireEvent.click(await screen.findByText('12').then((el) => el.closest('button')!));
    expect(await screen.findByRole('button', { name: LABEL_12 })).toBeInTheDocument();
  });

  it('axe: zero violações no calendário', async () => {
    const { baseElement } = renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    const results = await axe(baseElement, AXE);
    expect(results.violations).toEqual([]);
  });

  it('axe: zero violações com o diálogo do dia aberto', async () => {
    const { baseElement } = renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    // O Radix renderiza o diálogo em portal no document.body: axe roda sobre o
    // baseElement (raiz = body), senão mede só o container e o diálogo fica fora.
    fireEvent.click(screen.getByText('10').closest('button')!);
    await screen.findByRole('button', { name: LABEL_10 });
    const results = await axe(baseElement, AXE);
    expect(results.violations).toEqual([]);
  });
});
