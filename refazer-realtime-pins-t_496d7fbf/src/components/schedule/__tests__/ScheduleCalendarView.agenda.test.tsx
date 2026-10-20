/**
 * R2-MOD-029 (#404) — a Agenda não pode perder os PENDENTES por causa do histórico.
 *
 * Defeito (auditoria): a consulta global do hook trazia todos os status, ordenados
 * por `scheduled_at` CRESCENTE, sem faixa e sem páginas. O PostgREST devolve só a
 * primeira página (1000 linhas), então um histórico grande (enviadas/canceladas
 * antigas) ocupa a página inteira e os agendamentos futuros NUNCA chegam à tela —
 * a Agenda fica com "0 pendentes" e nada pode ser revisado ou cancelado por ali.
 * O erro de leitura também não chegava ao calendário: falha virava agenda vazia.
 *
 * Este teste usa o CALENDÁRIO REAL contra um servidor falso que reproduz o teto de
 * linhas do PostgREST, com histórico além do primeiro lote e pendentes no mês
 * exibido. Antes da correção: "0 pendentes" e nenhum horário na tela (vermelho).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addMonths, startOfMonth } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduledMessagesServer,
  fakeScheduledMessage,
  POSTGREST_PAGE,
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

const AGORA = new Date();
const MES_EXIBIDO = startOfMonth(AGORA);
const PROXIMO_MES = addMonths(MES_EXIBIDO, 1);

/** Histórico antigo (já enviado) — o que ocupa a primeira página do PostgREST. */
function historico(n: number) {
  const base = Date.UTC(2024, 0, 1, 8, 0, 0);
  return Array.from({ length: n }, (_, i) =>
    fakeScheduledMessage({
      id: `hist-${i}`,
      content: `Histórico antigo ${i}`,
      status: 'sent',
      sent_at: new Date(base + i * 60_000).toISOString(),
      scheduled_at: new Date(base + i * 60_000).toISOString(),
    }),
  );
}

/** Pendentes do mês EXIBIDO — os que a Agenda tem de mostrar. */
const pendentesDoMes = [
  fakeScheduledMessage({
    id: 'pend-mes-1',
    content: 'Confirmar entrega do pedido',
    status: 'pending',
    scheduled_at: new Date(MES_EXIBIDO.getFullYear(), MES_EXIBIDO.getMonth(), 10, 14, 30).toISOString(),
  }),
  fakeScheduledMessage({
    id: 'pend-mes-2',
    content: 'Enviar proposta revisada',
    status: 'pending',
    scheduled_at: new Date(MES_EXIBIDO.getFullYear(), MES_EXIBIDO.getMonth(), 12, 9, 15).toISOString(),
  }),
];

/** Pendente do mês seguinte — só aparece depois de navegar. */
const pendenteDoProximoMes = fakeScheduledMessage({
  id: 'pend-prox-1',
  content: 'Reunião de resultado',
  status: 'pending',
  scheduled_at: new Date(PROXIMO_MES.getFullYear(), PROXIMO_MES.getMonth(), 15, 10, 0).toISOString(),
});

function renderAgenda() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScheduleCalendarView />
    </QueryClientProvider>,
  );
}

describe('ScheduleCalendarView — R2-MOD-029', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    held.server = createScheduledMessagesServer([
      ...historico(POSTGREST_PAGE + 500),
      ...pendentesDoMes,
      pendenteDoProximoMes,
    ]);
  });

  it('mostra os pendentes do mês mesmo com o histórico ocupando a primeira página', async () => {
    renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    expect(screen.getByText('14:30')).toBeInTheDocument();

    // A leitura pediu SÓ os pendentes (o servidor falso devolve histórico primeiro
    // quando não há esse filtro) e dentro da faixa exibida.
    const [primeira] = held.server!.queries;
    expect(primeira.eq).toContainEqual(['status', 'pending']);
    expect(primeira.gte.map(([c]) => c)).toContain('scheduled_at');
    expect(primeira.lte.map(([c]) => c)).toContain('scheduled_at');
  });

  it('trocar de mês carrega a faixa do mês novo', async () => {
    renderAgenda();

    expect(await screen.findByText('2 pendentes')).toBeInTheDocument();
    expect(screen.queryByText('10:00')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));

    expect(await screen.findByText('10:00')).toBeInTheDocument();
    await waitFor(() => {
      const faixas = held.server!.queries.flatMap((q) => q.gte.filter(([c]) => c === 'scheduled_at').map(([, v]) => v));
      expect(faixas.some((v) => new Date(String(v)).getMonth() === PROXIMO_MES.getMonth())).toBe(true);
    });
  });

  it('falha de leitura não vira agenda vazia', async () => {
    held.server = createScheduledMessagesServer(pendentesDoMes, { error: { message: 'timeout' } });

    renderAgenda();

    expect(await screen.findByText('Não foi possível carregar os agendamentos')).toBeInTheDocument();
    expect(screen.queryByText('0 pendentes')).toBeNull();
  });
});
