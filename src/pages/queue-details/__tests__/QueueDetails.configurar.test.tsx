/**
 * R2-QUE-006 — o botão "Configurar" do cabeçalho da fila era decorativo: existia
 * sem `onClick`. Aqui a página REAL (QueueDetails + EditQueueDialog REAL) roda
 * sobre um supabase mockado: clicar em "Configurar" tem de abrir o formulário
 * preenchido com a fila e, ao salvar, gravar em `queues` e reexibir o novo nome
 * no cabeçalho. Antes do conserto o clique não abria nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type QueueRow = {
  id: string; name: string; description: string | null; color: string;
  max_wait_time_minutes: number | null; created_at: string;
};

const { mockFrom, mockUpdate, AUTH } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUpdate: vi.fn(),
  // Identidade estável: `user` é dependência do efeito da tela; um objeto novo a
  // cada render dispararia o fetch em laço e a tela nunca sai do carregando.
  AUTH: { user: { id: 'user-1' }, loading: false },
}));

let queueState: QueueRow = {
  id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
  max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useParams: () => ({ id: 'q-1' }), useNavigate: () => vi.fn() };
});

// Views pesadas da tela viram stubs: sob teste está o caminho de edição.
vi.mock('@/components/queues/QueueCharts', () => ({ QueueCharts: () => null }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => AUTH }));

import QueueDetails from '@/pages/QueueDetails';

const MEMBERS = [
  { id: 'm-1', profile_id: 'p-1', profile: { name: 'Ana', avatar_url: null, is_active: true } },
];

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
  mockUpdate.mockReset();
  queueState = {
    id: 'q-1', name: 'Fila Comercial', description: null, color: '#3B82F6',
    max_wait_time_minutes: 30, created_at: '2026-01-01T00:00:00Z',
  };
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'queues') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: queueState, error: null }) }) }),
        update: (updates: Record<string, unknown>) => ({
          eq: (_coluna: string, id: string) => {
            mockUpdate(id, updates);
            queueState = { ...queueState, ...updates };
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (tabela === 'queue_members') {
      return { select: () => ({ eq: () => Promise.resolve({ data: MEMBERS, error: null }) }) };
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

describe('QueueDetails — botão "Configurar" edita a fila (R2-QUE-006)', () => {
  it('abre o formulário preenchido, salva o novo nome e mostra no cabeçalho', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fila Comercial' })).toBeInTheDocument());

    // Antes do conserto o botão não tinha onClick: nada abria.
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));

    const campoNome = await screen.findByLabelText('Nome');
    expect(campoNome).toHaveValue('Fila Comercial');
    expect(screen.getByLabelText('Tempo máximo de espera (min)')).toHaveValue(30);

    fireEvent.change(campoNome, { target: { value: 'Fila Comercial N2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('q-1', expect.objectContaining({ name: 'Fila Comercial N2' }))
    );
    // A tela relê a fila e o cabeçalho passa a exibir o novo nome.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fila Comercial N2' })).toBeInTheDocument());
  });
});
