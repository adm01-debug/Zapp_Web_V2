import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Cartão de paridade V3: as metas precisam ser coerentes antes de salvar — taxa de resolução
 * entre 0 e 100 e alvos crescentes com o período (semanal >= diária, mensal >= semanal).
 */
const mocks = vi.hoisted(() => ({
  existingGoals: [
    { id: 'goal-messages', goal_type: 'messages_sent', daily_target: 70, weekly_target: 350, monthly_target: 1400, is_active: true },
    { id: 'goal-contacts', goal_type: 'contacts_handled', daily_target: 15, weekly_target: 75, monthly_target: 300, is_active: true },
    { id: 'goal-resolution', goal_type: 'resolution_rate', daily_target: 90, weekly_target: 90, monthly_target: 95, is_active: true },
  ],
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; id: unknown }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface Builder {
  select: () => Builder;
  eq: (col?: string, val?: unknown) => Builder;
  single: () => Promise<QueryResult>;
  then: <TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
  update: (payload: Record<string, unknown>) => {
    eq: (col: string, val: unknown) => Promise<QueryResult>;
  };
  insert: (payload: Record<string, unknown>) => Promise<QueryResult>;
}

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string): Builder => {
    const result: QueryResult =
      table === 'goals_configurations'
        ? { data: mocks.existingGoals, error: null }
        : { data: { id: 'profile-1', name: 'Ana' }, error: null };
    const b = {} as Builder;
    b.select = () => b;
    b.eq = () => b;
    b.single = () => Promise.resolve(result);
    b.then = (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
    b.update = (payload) => ({
      eq: (_col, val) => {
        mocks.updates.push({ table, payload, id: val });
        return Promise.resolve({ data: null, error: null });
      },
    });
    b.insert = (payload) => {
      mocks.inserts.push({ table, payload });
      return Promise.resolve({ data: null, error: null });
    };
    return b;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { GoalsConfigDialog } from '../GoalsConfigDialog';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const renderDialog = () =>
  render(<GoalsConfigDialog open onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

const salvar = () => screen.getByRole('button', { name: /Salvar Metas/i });

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('GoalsConfigDialog — validação das metas', () => {
  beforeEach(() => {
    mocks.updates = [];
    mocks.inserts = [];
  });

  it('barra a taxa de resolução acima de 100%', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    fireEvent.change(campo('daily-resolution_rate'), { target: { value: '120' } });

    expect(await screen.findByText('A taxa de resolução deve ficar entre 0% e 100%.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();

    fireEvent.click(salvar());
    expect(mocks.updates).toHaveLength(0);
  });

  it('barra a meta semanal menor que a diária', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    fireEvent.change(campo('weekly-messages_sent'), { target: { value: '30' } });

    expect(await screen.findByText('A meta semanal não pode ser menor que a diária.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('barra a meta mensal menor que a semanal', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    fireEvent.change(campo('monthly-contacts_handled'), { target: { value: '40' } });

    expect(await screen.findByText('A meta mensal não pode ser menor que a semanal.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('metas coerentes salvam normalmente (controle)', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    expect(salvar()).toBeEnabled();
    fireEvent.click(salvar());

    await waitFor(() => expect(mocks.updates).toHaveLength(3));
    expect(mocks.inserts).toHaveLength(0);
  });
});
