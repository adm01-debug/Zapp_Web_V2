/**
 * R2-QUE-006 — o item "Editar" do card de fila era decorativo: aparecia no menu
 * de ações do cartão sem nenhum callback (só "Ver Detalhes", "Metas e Alertas" e
 * "Excluir" agiam). Aqui o QueuesView REAL é montado sobre um supabase mockado,
 * com o QueueCard REAL e o formulário REAL: clicar em "Editar" tem de abrir o
 * formulário já preenchido com os dados da fila e, ao salvar, gravar em `queues`
 * e refletir o novo nome no card. Antes do conserto o clique não abria nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Radix (DropdownMenu) mede o trigger com ResizeObserver, API ausente no jsdom,
// e fecha o menu por pointer capture — mesmo polyfill dos testes de catálogo.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};

type QueueRow = {
  id: string; name: string; description: string | null; color: string;
  is_active: boolean; max_wait_time_minutes: number | null; priority: number;
  created_at: string; updated_at: string;
};

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

let queuesState: QueueRow[] = [];

const mockWaitingCounts: Record<string, number> = { q1: 0 };

function contactsCountBuilder(queueIdRef: { id: string }) {
  return {
    eq: vi.fn((column: string, value: unknown) => {
      if (column === 'queue_id') queueIdRef.id = String(value);
      return contactsCountBuilder(queueIdRef);
    }),
    is: vi.fn(() => contactsCountBuilder(queueIdRef)),
    not: vi.fn(() => Promise.resolve({ count: mockWaitingCounts[queueIdRef.id] ?? 0, error: null })),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'queues') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockImplementation(() => Promise.resolve({ data: queuesState, error: null })),
          }),
          update: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
            eq: vi.fn().mockImplementation((_column: string, id: string) => {
              mockUpdate(id, updates);
              queuesState = queuesState.map((q) => (q.id === id ? { ...q, ...updates } : q));
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === 'queue_members') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'queue_goals') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'contacts') {
        return { select: vi.fn(() => contactsCountBuilder({ id: '' })) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
// Apenas os diálogos que NÃO estão sob prova viram stub; o EditQueueDialog é real.
vi.mock('@/components/queues/CreateQueueDialog', () => ({ CreateQueueDialog: () => null }));
vi.mock('@/components/queues/AddMemberDialog', () => ({ AddMemberDialog: () => null }));
vi.mock('@/components/queues/QueueGoalsDialog', () => ({ QueueGoalsDialog: () => null }));

import { QueuesView } from '@/components/queues/QueuesView';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockReset();
  queuesState = [
    {
      id: 'q1', name: 'Suporte', description: 'Atendimento geral', color: '#3B82F6',
      is_active: true, max_wait_time_minutes: 30, priority: 1, created_at: '', updated_at: '',
    },
  ];
});

/** Trigger do menu de ações do card — o Radix marca o botão com aria-haspopup="menu". */
function abrirMenuDeAcoes(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('button[aria-haspopup="menu"]');
  if (!trigger) throw new Error('Menu de ações do card não encontrado');
  return trigger as HTMLElement;
}

describe('QueuesView — ação "Editar" do card grava a fila (R2-QUE-006)', () => {
  it('abre o formulário preenchido, salva o novo nome e reflete no card', async () => {
    const { container } = render(
      <MemoryRouter>
        <QueuesView />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Suporte')).toBeInTheDocument());

    // O item "Editar" do menu de ações do card (antes: sem callback, nada abria).
    fireEvent.keyDown(abrirMenuDeAcoes(container), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    const campoNome = await screen.findByLabelText('Nome');
    expect(campoNome).toHaveValue('Suporte');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Atendimento geral');

    fireEvent.change(campoNome, { target: { value: 'Suporte N2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('q1', expect.objectContaining({ name: 'Suporte N2' }))
    );
    // A tela relê a fila e mostra o novo nome no card (o diálogo fecha).
    await waitFor(() => expect(screen.getByText('Suporte N2')).toBeInTheDocument());
  });

  it('o nome vazio não dispara gravação (botão Salvar desabilitado)', async () => {
    const { container } = render(
      <MemoryRouter>
        <QueuesView />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Suporte')).toBeInTheDocument());

    fireEvent.keyDown(abrirMenuDeAcoes(container), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    const campoNome = await screen.findByLabelText('Nome');
    fireEvent.change(campoNome, { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
