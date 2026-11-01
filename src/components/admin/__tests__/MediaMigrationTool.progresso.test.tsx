import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { within } from '@testing-library/react';

const { invokeEdgeMock, fromMock } = vi.hoisted(() => ({
  invokeEdgeMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

type ThenFn = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => Promise<unknown>;

function makeQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  const same = () => query;
  query.select = vi.fn(same);
  query.like = vi.fn(same);
  query.eq = vi.fn(same);
  query.order = vi.fn(same);
  query.limit = vi.fn(same);
  query.in = vi.fn(same);
  (query.then as ThenFn) = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function mockBackend() {
  fromMock.mockImplementation((table: string) => {
    if (table === 'messages') return makeQuery({ count: 1, error: null });
    if (table === 'audit_logs') return makeQuery({ data: [], error: null });
    if (table === 'profiles') return makeQuery({ data: [], error: null });
    throw new Error(`Tabela não esperada: ${table}`);
  });
}

import { MediaMigrationTool } from '../MediaMigrationTool';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaMigrationTool — progresso durante a migração', () => {
  it('usa progressbar indeterminado com nome acessível, sem percentual fixo', async () => {
    mockBackend();
    invokeEdgeMock.mockImplementation(() => new Promise(() => {}));

    render(<MediaMigrationTool />);
    await screen.findByText('2 mídias pendentes');

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Iniciar migração' }));

    // Mantém role="progressbar" com o nome que o N-066 exige no estado em execução...
    const barra = await screen.findByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toBeInTheDocument();
    // ...mas indeterminado: a barra antiga era um <Progress value={30}> — percentual inventado.
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(barra).toHaveAttribute('data-state', 'indeterminate');
  });
});
