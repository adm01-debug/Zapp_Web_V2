import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * R2-QUE-004 — consultas agregadas no detalhe da fila.
 *
 * O defeito antigo: cada um dos 50 contatos da página disparava DUAS consultas próprias de
 * `messages` (contagem + última mensagem) e uma de `profiles` — a tela abria com ~150 idas ao
 * banco e o número de consultas crescia junto com o tamanho da página.
 *
 * Este teste conta quantas vezes `messages` é consultada com 50 contatos na página. Antes,
 * `messages` era consultada 2×N (=100) vezes; com o enriquecimento agregado é 1 (por
 * `in('contact_id', ids)`). O mock aceita as DUAS formas de leitura, de propósito: assim o
 * vermelho é pela CONTAGEM de consultas, não por um mock que só conhece a forma nova.
 */

const PAGE_SIZE = 50;

const { mockFrom, AUTH } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  AUTH: { user: { id: 'user-1' }, loading: false },
}));

/** Consultas a `messages` observadas na renderização inteira. */
const messageQueries = [] as string[];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

vi.mock('@/components/queues/QueueCharts', () => ({ QueueCharts: () => null }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => AUTH }));

import QueueDetails from '@/pages/QueueDetails';

const QUEUE = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

const PAGINA = Array.from({ length: PAGE_SIZE }, (_, i) => ({
  id: `c-${i}`,
  name: `Contato ${i}`,
  phone: `551199999${String(i).padStart(4, '0')}`,
  avatar_url: null,
  assigned_to: 'p-1',
  created_at: `2026-10-05T10:${String(i % 60).padStart(2, '0')}:00Z`,
}));

function thenable(resposta: unknown) {
  return { then: (f: (v: unknown) => unknown) => Promise.resolve(resposta).then(f) };
}

function contagemNode() {
  const node: Record<string, unknown> = {};
  node.eq = () => node;
  node.not = () => node;
  node.gte = () => node;
  node.lt = () => node;
  node.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, count: 0, error: null }).then(f);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  messageQueries.length = 0;
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      // `single` (implementação antiga) e `maybeSingle` (nova) — o mock aceita as duas.
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: QUEUE, error: null }),
            maybeSingle: () => Promise.resolve({ data: QUEUE, error: null }),
          }),
        }),
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
            : { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: PAGINA, error: null }) }) }) },
      };
    }
    if (tabela === 'messages') {
      messageQueries.push(tabela);
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) =>
          opts?.head
            ? // leitura por contato (implementação antiga)
              { eq: () => thenable({ data: null, count: 3, error: null }) }
            : {
                // última mensagem por contato (antiga) …
                eq: () => ({
                  order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { created_at: '2026-10-05T11:00:00Z' }, error: null }) }) }),
                }),
                // … e leitura agregada por `in` (nova).
                in: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }),
              },
      };
    }
    if (tabela === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: 'Ana', avatar_url: null }, error: null }) }),
          in: () => Promise.resolve({ data: [{ id: 'p-1', name: 'Ana', avatar_url: null }], error: null }),
        }),
      };
    }
    if (tabela === 'conversation_sla') {
      return { select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    }
    return { select: () => thenable({ data: [], error: null }) };
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/queues/q-1']}>
      <QueueDetails />
    </MemoryRouter>,
  );
}

describe('QueueDetails — enriquecimento dos contatos é agregado (R2-QUE-004)', () => {
  it('consulta `messages` uma vez para 50 contatos, não uma vez por contato', async () => {
    renderPage();

    // A página carrega (a fila aparece no cabeçalho) …
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument());

    // … e não há consulta por contato; a paginação de mensagens ainda pode adicionar páginas.
    expect(messageQueries).toHaveLength(1);
  });

  it('mantém o total de idas ao banco independente do tamanho da página', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument());

    // Antes: ~1 (fila) + 1 (equipe) + 1 (página) + 3 (contagens) + 100 (mensagens) + 50 (atendentes) + 1 (SLA).
    // Agora é um número fixo de consultas, muito abaixo de PAGE_SIZE.
    expect(mockFrom.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
