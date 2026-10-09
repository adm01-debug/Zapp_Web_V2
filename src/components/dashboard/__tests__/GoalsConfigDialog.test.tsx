import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #429 — "Restaurar Padrões" perdia o `id` das metas já salvas e o Salvar caía
// no insert, batendo no UNIQUE(profile_id, goal_type) de `goals_configurations`.
const mocks = vi.hoisted(() => ({
  existingGoals: [
    { id: 'goal-messages', goal_type: 'messages_sent', daily_target: 70, weekly_target: 350, monthly_target: 1400, is_active: true },
    { id: 'goal-contacts', goal_type: 'contacts_handled', daily_target: 15, weekly_target: 75, monthly_target: 300, is_active: true },
    { id: 'goal-resolution', goal_type: 'resolution_rate', daily_target: 90, weekly_target: 90, monthly_target: 95, is_active: false },
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

describe('GoalsConfigDialog — Restaurar Padrões (#429)', () => {
  beforeEach(() => {
    mocks.updates = [];
    mocks.inserts = [];
  });

  it('restaura os valores padrão preservando o id: Salvar atualiza as metas existentes, não reinsere', async () => {
    renderDialog();

    // As metas salvas carregaram (70 é o alvo diário de mensagens enviadas).
    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Restaurar Padrões/i }));

    // O usuário vê o valor padrão de volta (50/dia para mensagens enviadas).
    const dailyMessages = document.getElementById('daily-messages_sent') as HTMLInputElement;
    expect(dailyMessages.value).toBe('50');
    expect(screen.queryByDisplayValue('70')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salvar Metas/i }));

    await waitFor(() => expect(mocks.updates).toHaveLength(3));

    // Nenhum insert: as três metas já existiam (UNIQUE(profile_id, goal_type)).
    expect(mocks.inserts).toHaveLength(0);

    const messages = mocks.updates.find((u) => u.id === 'goal-messages');
    expect(messages?.table).toBe('goals_configurations');
    expect(messages?.payload).toEqual({
      daily_target: 50,
      weekly_target: 250,
      monthly_target: 1000,
      is_active: true,
    });

    const resolution = mocks.updates.find((u) => u.id === 'goal-resolution');
    expect(resolution?.payload).toEqual({
      daily_target: 80,
      weekly_target: 80,
      monthly_target: 85,
      is_active: true,
    });
  });

  it('sem Restaurar Padrões, Salvar também atualiza pelo id (controle)', async () => {
    renderDialog();

    await waitFor(() => expect(screen.getByDisplayValue('70')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Salvar Metas/i }));

    await waitFor(() => expect(mocks.updates).toHaveLength(3));
    expect(mocks.inserts).toHaveLength(0);
    const messages = mocks.updates.find((u) => u.id === 'goal-messages');
    expect(messages?.payload).toEqual({
      daily_target: 70,
      weekly_target: 350,
      monthly_target: 1400,
      is_active: true,
    });
  });
});
