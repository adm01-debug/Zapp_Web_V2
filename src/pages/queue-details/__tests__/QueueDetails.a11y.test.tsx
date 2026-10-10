import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

/**
 * N-192 (A11Y-CATALOGO_FILAS_SLA-07): a tela de detalhe da fila mantinha todo o
 * conteudo fora das regioes que o leitor de tela usa para navegar. O conteudo
 * precisa ficar dentro de um <main> com um titulo principal (<h1>).
 *
 * Aqui a PAGINA REAL (QueueDetails) e renderizada com o supabase mockado. Sem o
 * conserto, o estado carregado e o estado "Fila nao encontrada" renderizavam um
 * <div> (sem landmark `main`) e o titulo era um <h2>; as regras `region` e
 * `landmark-one-main` do axe acusavam violacao.
 */

const { mockFrom, AUTH, respostaDaFila } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  // Identidade estavel: `user` e dependencia do efeito da tela; um objeto novo
  // a cada render dispararia o fetch em loop.
  AUTH: { user: { id: 'user-1' }, loading: false },
  // Controla o retorno de `queues.select().eq().single()`: achou a fila ou nao.
  respostaDaFila: { atual: 'encontrada' as 'encontrada' | 'ausente' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// A tela le a fila da rota; aqui a rota e fixa e a navegacao e inerte.
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

// Grafico pesado vira stub: sob teste esta o landmark, nao o grafico.
vi.mock('@/components/queues/QueueCharts', () => ({ QueueCharts: () => null }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => AUTH }));

import QueueDetails from '@/pages/QueueDetails';

const QUEUE = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

const MEMBERS = [
  { id: 'm-1', profile_id: 'p-1', profile: { name: 'Ana', avatar_url: null, is_active: true } },
];

const PAGINA = [
  {
    id: 'c-0', name: 'Contato 0', phone: '5511999990000', avatar_url: null,
    assigned_to: 'p-1', created_at: '2026-10-05T10:00:00Z',
  },
];

/** Thenable no formato devolvido pelo supabase-js (com `.then`). */
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
  respostaDaFila.atual = 'encontrada';
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(
              respostaDaFila.atual === 'encontrada'
                ? { data: QUEUE, error: null }
                : { data: null, error: null },
            ),
          }),
        }),
      };
    }
    if (tabela === 'queue_members') {
      return { select: () => ({ eq: () => Promise.resolve({ data: MEMBERS, error: null }) }) };
    }
    if (tabela === 'contacts') {
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) return contagemNode();
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: PAGINA, error: null }) }) }) };
        },
      };
    }
    if (tabela === 'messages') {
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) =>
          opts?.head
            ? { eq: () => thenable({ data: null, count: 1, error: null }) }
            : {
                eq: () => ({
                  order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { created_at: '2026-10-05T11:00:00Z' } }) }) }),
                }),
              },
      };
    }
    if (tabela === 'profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: 'Ana', avatar_url: null } }) }) }) };
    }
    if (tabela === 'conversation_sla') {
      return {
        select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }) }),
      };
    }
    return { select: () => thenable({ data: [], error: null }) };
  });
});

// Cada teste monta a pagina inteira: desmonta e limpa o body ao fim, para as
// consultas por papel e a varredura do axe enxergarem so a pagina deste teste.
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/queues/q-1']}>
      <QueueDetails />
    </MemoryRouter>,
  );
}

/** Regras de landmark que o cartao exige zeradas. */
async function violacoesDeLandmark(alvo: HTMLElement) {
  const results = await axe(alvo, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.filter((v) => ['region', 'landmark-one-main'].includes(v.id));
}

describe('QueueDetails — conteudo em <main> com titulo principal (N-192)', () => {
  it('fila carregada: existe um <main> e um <h1> com o nome da fila', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('fila carregada: axe nao acusa region nem landmark-one-main', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Fila Comercial' });
    expect(await violacoesDeLandmark(document.documentElement)).toEqual([]);
  });

  it('fila nao encontrada: existe um <main> e um <h1> com o titulo do estado', async () => {
    respostaDaFila.atual = 'ausente';
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Fila não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('fila nao encontrada: axe nao acusa region nem landmark-one-main', async () => {
    respostaDaFila.atual = 'ausente';
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Fila não encontrada' });
    expect(await violacoesDeLandmark(document.documentElement)).toEqual([]);
  });
});
