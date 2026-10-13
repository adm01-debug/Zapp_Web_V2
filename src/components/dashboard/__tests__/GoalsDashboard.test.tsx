import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { startOfMonth } from 'date-fns';

// O seletor de período (Hoje/Semana/Mês) tinha sumido da aba Metas: o card
// fixava "Metas do dia" e o hook recebia sempre o período diário. Estes testes
// provam que os 3 períodos aparecem, que trocar o período muda alvo/faixa de
// datas/filtro do banco e que a tela não pisca "0%" antes dos dados.

const mocks = vi.hoisted(() => {
  let release: (() => void) | null = null;
  let gate: Promise<void> = Promise.resolve();
  return {
    counts: { messages: 2, contacts: 1, analyses: 3, resolved: 1 },
    dateFilters: [] as Array<{ table: string; from?: string; resolved?: boolean }>,
    resetGate: () => {
      release = null;
      gate = new Promise<void>((resolve) => { release = () => resolve(); });
    },
    openGate: () => { release?.(); },
    waitGate: () => gate,
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let from: string | undefined;
    let resolvedOnly = false;

    const result = () => {
      if (table === 'profiles') return { data: { id: 'profile-1', name: 'Ana' }, error: null };
      if (table === 'goals_configurations') return { data: [], error: null };
      if (table === 'messages') return { count: mocks.counts.messages, error: null };
      if (table === 'contacts') return { count: mocks.counts.contacts, error: null };
      if (table === 'conversation_analyses') {
        return { count: resolvedOnly ? mocks.counts.resolved : mocks.counts.analyses, error: null };
      }
      return { data: null, error: null };
    };

    const record = () => {
      mocks.dateFilters.push({ table, from, resolved: resolvedOnly });
    };

    const b = {} as Record<string, unknown>;
    b.select = () => b;
    b.eq = (col: string, val: unknown) => {
      if (col === 'status' && val === 'resolvido') resolvedOnly = true;
      return b;
    };
    b.gte = (col: string, val: string) => {
      if (col === 'created_at') from = val;
      return b;
    };
    b.lte = () => b;
    b.order = () => b;
    b.maybeSingle = () => mocks.waitGate().then(() => result());
    b.single = () => mocks.waitGate().then(() => result());
    b.then = (
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => mocks.waitGate().then(() => { record(); return result(); }).then(onfulfilled, onrejected);
    return b;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/gamification/useAgentGamification', () => ({
  useAgentGamification: () => ({ stats: null }),
  levelProgress: () => 0,
  xpForNextLevel: () => 100,
}));

import { GoalsDashboard } from '../GoalsDashboard';

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const renderDashboard = () =>
  render(<GoalsDashboard />, { wrapper: createWrapper() });

describe('GoalsDashboard — seletor de período (Hoje/Semana/Mês)', () => {
  beforeEach(() => {
    mocks.dateFilters = [];
    mocks.resetGate();
    mocks.openGate();
  });

  it('mostra os 3 períodos e usa o hook com o período diário por padrão', async () => {
    renderDashboard();

    expect(screen.getByRole('radiogroup', { name: 'Período das metas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Esta Semana' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Este Mês' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveAttribute('aria-checked', 'true');

    await waitFor(() => expect(screen.getByText('Metas do dia')).toBeInTheDocument());
  });

  it('não pisca "0%" enquanto carrega: mostra skeleton e só depois os valores', async () => {
    mocks.resetGate(); // segura as consultas para observar o estado de carregamento
    renderDashboard();

    expect(screen.getByRole('status', { name: 'Carregando metas' })).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('Progresso Geral')).not.toBeInTheDocument();

    mocks.openGate();

    await waitFor(() => expect(screen.getByText('Progresso Geral')).toBeInTheDocument());
    expect(screen.queryByRole('status', { name: 'Carregando metas' })).not.toBeInTheDocument();
    // 2/50 (4%) + 1/10 (10%) + 33/80 (41,25%) → média arredondada 18%.
    expect(screen.getByText('18%')).toBeInTheDocument();
  });

  it('trocar para "Este Mês" muda título, faixa de datas, alvo e filtro do banco', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Metas do dia')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('radio', { name: 'Este Mês' }));

    await waitFor(() => expect(screen.getByText('Metas do mês')).toBeInTheDocument());
    expect(screen.queryByText('Metas do dia')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Este Mês' })).toHaveAttribute('aria-checked', 'true');

    // Faixa de datas do mês, em pt-BR.
    const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());
    expect(screen.getByText(monthLabel)).toBeInTheDocument();

    // O alvo mensal (1.000) substitui o diário (50): prova que o período chegou ao hook.
    await waitFor(() => expect(screen.getByText(/2 \/ 1\.000/)).toBeInTheDocument());

    // E o recorte enviado ao banco passou a partir do início do mês.
    const esperado = startOfMonth(new Date()).toISOString();
    await waitFor(() => {
      const mensagens = mocks.dateFilters.filter((f) => f.table === 'messages').pop();
      expect(mensagens?.from).toBe(esperado);
    });
  });

  it('trocar para "Esta Semana" mostra o título da semana e o alvo semanal', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Metas do dia')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('radio', { name: 'Esta Semana' }));

    await waitFor(() => expect(screen.getByText('Metas da semana')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/2 \/ 250/)).toBeInTheDocument());
  });
});
