import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * R2-QUE-004 — a tela de detalhes da fila distingue os dois modos de falha:
 * - leitura quebrada (rede/RLS) → "Erro ao carregar a fila" + botão "Tentar novamente";
 * - id inexistente (PostgREST devolve `null`) → "Fila não encontrada" sem retry.
 *
 * Antes os dois caíam no mesmo "Fila não encontrada", e quem caísse numa falha de rede
 * ficava sem caminho de recuperação.
 */

const h = vi.hoisted(() => ({
  queueResult: { data: null as unknown, error: null as unknown },
  membersError: null as { message: string } | null,
}));

const QUEUE = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'queues') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(h.queueResult) }),
          }),
        };
      }
      if (tabela === 'queue_members') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: h.membersError }) }) };
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
        return { select: () => ({ in: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      if (tabela === 'profiles') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (tabela === 'conversation_sla') {
        return { select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

vi.mock('@/components/queues/QueueCharts', () => ({ QueueCharts: () => null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}));

import QueueDetails from '@/pages/QueueDetails';

function contagemNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  for (const metodo of ['eq', 'not', 'gte', 'lt', 'order', 'limit', 'range']) {
    node[metodo] = () => node;
  }
  node.then = (onFulfilled?: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, count: 0, error: null }).then(onFulfilled);
  return node;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/queues/q-1']}>
      <QueueDetails />
    </MemoryRouter>,
  );
}

describe('QueueDetails — erro e não encontrada são estados distintos (R2-QUE-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.queueResult = { data: null, error: null };
    h.membersError = null;
  });

  it('falha de leitura mostra "Erro ao carregar a fila" e oferece "Tentar novamente"', async () => {
    h.queueResult = { data: null, error: { message: 'network error' } };
    renderPage();

    expect(await screen.findByText('Erro ao carregar a fila')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Fila não encontrada')).not.toBeInTheDocument();
  });

  it('id inexistente mostra "Fila não encontrada" sem botão de repetir', async () => {
    h.queueResult = { data: null, error: null };
    h.membersError = null;
    renderPage();

    expect(await screen.findByText('Fila não encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });


  it('mostra aviso com retry quando a fila carrega mas uma consulta complementar falha', async () => {
    h.queueResult = { data: QUEUE, error: null };
    h.membersError = { message: 'members timeout' };

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument();
    expect(screen.getByText('Erro ao carregar dados da fila')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
