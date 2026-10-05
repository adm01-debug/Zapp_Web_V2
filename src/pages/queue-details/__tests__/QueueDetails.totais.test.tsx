import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * R2-QUE-003 (item 107, P1): os totais da tela de fila eram calculados sobre a
 * PAGINA de contatos (`limit(50)`), entao uma fila com mais de 50 contatos
 * mostrava "Total de Contatos" = 50 e "Aguardando" derivado desse recorte.
 *
 * Aqui o servidor declara 137 contatos na fila (92 atribuidos) e devolve apenas
 * 50 linhas na pagina. Se alguem voltar a usar `contactsWithDetails.length` como
 * total, este teste quebra — que e exatamente o defeito antigo.
 */

const PAGE_SIZE = 50;
const TOTAL_CONTACTS = 137;
const ASSIGNED_CONTACTS = 92;

const { mockFrom, contactsSelect, AUTH } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  contactsSelect: vi.fn(),
  // Identidade estavel: `user` e dependencia do efeito da tela; um objeto novo a
  // cada render dispararia o fetch em loop.
  AUTH: { user: { id: 'user-1' }, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// A tela le a fila da rota; aqui a rota e fixa e a navegacao e inerte.
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

// Views pesadas da tela viram stubs: sob teste esta a origem dos TOTAIS.
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

/** 50 linhas de pagina — de proposito, muito menos que os 137 da fila. */
const PAGINA = Array.from({ length: PAGE_SIZE }, (_, i) => ({
  id: `c-${i}`,
  name: `Contato ${i}`,
  phone: `551199999${String(i).padStart(4, '0')}`,
  avatar_url: null,
  assigned_to: 'p-1',
  created_at: `2026-10-05T10:${String(i % 60).padStart(2, '0')}:00Z`,
}));

/** Thenable no formato devolvido pelo supabase-js (com `.then`). */
function thenable(resposta: unknown) {
  return { then: (f: (v: unknown) => unknown) => Promise.resolve(resposta).then(f) };
}

/**
 * `select('id', { count: 'exact', head: true }).eq(...)` — o total do servidor.
 * A variante com `.not('assigned_to','is',null)` e o total de atribuidos.
 */
function contagemNode() {
  let atribuido = false;
  const node: Record<string, unknown> = {};
  node.eq = () => node;
  node.not = () => { atribuido = true; return node; };
  node.then = (f: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, count: atribuido ? ASSIGNED_CONTACTS : TOTAL_CONTACTS, error: null }).then(f);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: QUEUE, error: null }) }) }) };
    }
    if (tabela === 'queue_members') {
      return { select: () => ({ eq: () => Promise.resolve({ data: MEMBERS, error: null }) }) };
    }
    if (tabela === 'contacts') {
      return {
        select: (colunas?: string, opts?: { count?: string; head?: boolean }) => {
          contactsSelect(colunas, opts);
          if (opts?.head) return contagemNode();
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: PAGINA, error: null }) }) }) };
        },
      };
    }
    if (tabela === 'messages') {
      return {
        select: (_colunas?: string, opts?: { count?: string; head?: boolean }) =>
          opts?.head
            ? { eq: () => thenable({ data: null, count: 3, error: null }) }
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
    return { select: () => thenable({ data: [], error: null }) };
  });
});

function renderPage() {
  // MemoryRouter fornece o contexto de rota para o PageHeader; a rota em si e
  // mockada (useParams), para o teste nao depender do roteador real.
  return render(
    <MemoryRouter initialEntries={['/queues/q-1']}>
      <QueueDetails />
    </MemoryRouter>,
  );
}

describe('QueueDetails — totais de fila vem do servidor, nao da pagina (R2-QUE-003)', () => {
  it('fila com 137 contatos declara 137 no total, com uma pagina de 50', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Total de Contatos')).toBeInTheDocument());
    // antes do conserto: contactsWithDetails.length = 50
    expect(await screen.findByText(String(TOTAL_CONTACTS))).toBeInTheDocument();
    expect(screen.queryByText(String(PAGE_SIZE))).not.toBeInTheDocument();
  });

  it('Aguardando usa os totais reais (137 menos 92 = 45), nao o recorte', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Aguardando')).toBeInTheDocument());
    // antes do conserto: 50 - 50 = 0 (todas as linhas da pagina estavam atribuidas)
    expect(await screen.findByText(String(TOTAL_CONTACTS - ASSIGNED_CONTACTS))).toBeInTheDocument();
  });

  it('pede a contagem exata ao servidor em vez de medir a pagina', async () => {
    renderPage();

    await waitFor(() =>
      expect(contactsSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true }),
    );
  });

  it('a pagina de contatos continua sendo a lista paginada (50 linhas)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(PAGE_SIZE + 1));
  });
});
