/**
 * B13 (etapa 20): trocar Lista <-> Quadro <-> Agenda NAO gera request.
 *
 * Antes o `TasksModule` passava `{ includeDone: mode === 'board' }` para o hook,
 * o que mudava a query key e refazia a busca a cada troca de modo. Agora existe
 * uma unica query e a contagem de `select` no cliente Supabase prova isso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  undoToast: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: h.undoToast }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => h.auth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.from(table),
    channel: (name: string) => h.channel(name),
    removeChannel: (ch: unknown) => h.removeChannel(ch),
  },
}));

import { TasksModule } from '@/components/tasks/TasksModule';
import { MemoryRouter } from 'react-router-dom';

function makeBuilder(result: unknown) {
  const q = {
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  } as Record<string, unknown> & { then: unknown };
  for (const m of ['eq', 'neq', 'or', 'not', 'order', 'limit', 'is', 'in']) {
    (q as Record<string, unknown>)[m] = () => q;
  }
  return q;
}

const item: Row = {
  id: 't1',
  title: 'Ligar para o cliente',
  description: null,
  status: 'todo',
  priority: 'medium',
  due_date: null,
  remind_at: null,
  notified_at: null,
  waiting_reason: null,
  position: 0,
  started_at: null,
  status_changed_at: '2026-09-29T10:00:00.000Z',
  completed_at: null,
  contact_id: null,
  created_by: 'u1',
  assigned_to: 'u1',
  created_at: '2026-09-29T10:00:00.000Z',
  updated_at: '2026-09-29T10:00:00.000Z',
  contact: null,
};

function renderModule() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TasksModule />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('TasksModule — B13 (uma query para os tres modos)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    h.auth.mockReturnValue({ profile: { id: 'u1' } });
    h.channel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    });
    h.from.mockImplementation(() => ({
      select: (cols: string) => { h.select(cols); return makeBuilder({ data: [item], error: null }); },
      insert: () => makeBuilder({ error: null }),
      update: () => makeBuilder({ error: null }),
      upsert: () => makeBuilder({ error: null }),
    }));
  });

  it('mantem 1 request ao alternar Lista -> Quadro -> Agenda', async () => {
    renderModule();

    // carga inicial das tarefas = 1 select
    await waitFor(() => expect(h.select).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Ligar para o cliente')).toBeTruthy());

    // Lista -> Quadro (o botao do ModeSwitcher)
    fireEvent.click(screen.getByText('Quadro'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('board');
    });
    expect(h.select).toHaveBeenCalledTimes(1);

    // Quadro -> Agenda
    fireEvent.click(screen.getByText('Agenda'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('agenda');
    });
    expect(h.select).toHaveBeenCalledTimes(1);

    // volta para a Lista: o titulo carregado na primeira query continua ali
    fireEvent.click(screen.getByText('Lista'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('list');
    });
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Ligar para o cliente').length).toBeGreaterThan(0);
  });
});
