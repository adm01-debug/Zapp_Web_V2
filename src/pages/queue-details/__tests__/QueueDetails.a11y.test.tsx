/**
 * N-192 — acessibilidade: conteúdo da página de fila dentro de <main>
 * com um heading principal (h1). O axe reporta zero violações da regra
 * landmark-one-main (e de qualquer outra regra estrutural).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

type QueueRow = {
  id: string; name: string; description: string | null; color: string;
  max_wait_time_minutes: number | null; created_at: string;
};

const { mockFrom, AUTH } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  AUTH: { user: { id: 'user-1' }, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

// Views pesadas da tela viram stubs: sob teste está a estrutura de acessibilidade.
vi.mock('@/components/queues/QueueCharts', () => ({ QueueCharts: () => null }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => AUTH }));

import QueueDetails from '@/pages/QueueDetails';

function contagemNode() {
  const node: Record<string, unknown> = {};
  node.eq = () => node;
  node.not = () => node;
  node.gte = () => node;
  node.lt = () => node;
  node.then = (f: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, count: 0, error: null }).then(f);
  return node;
}

const QUEUE: QueueRow = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: QUEUE, error: null }) }) }),
      };
    }
    if (tabela === 'queue_members') {
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }
    if (tabela === 'contacts') {
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) =>
          opts?.head
            ? contagemNode()
            : { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) },
      };
    }
    if (tabela === 'messages') {
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) =>
          opts?.head
            ? { eq: () => Promise.resolve({ data: null, count: 0, error: null }) }
            : { eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) },
      };
    }
    if (tabela === 'conversation_sla') {
      return { select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    }
    return { select: () => Promise.resolve({ data: [], error: null }) };
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/queues/q-1']}>
      <QueueDetails />
    </MemoryRouter>
  );
}

describe('QueueDetails — landmark-one-main (N-192)', () => {
  it('renderiza a página dentro de <main> com heading h1', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument());

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();

    const results = await axe(main);
    expect(results).toHaveNoViolations();
  });
});