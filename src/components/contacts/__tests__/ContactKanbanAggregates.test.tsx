import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Mover no Kanban muda `contact_type`: KPIs e contadores por tipo precisam ser
 * invalidados em TODO update aceito pelo banco — inclusive quando um drag
 * posterior do mesmo card o superou e depois falhou (o valor final é o dele).
 */
type Deferred = { resolve: (v: { error: unknown }) => void };

const mocks = vi.hoisted(() => ({
  onDragEnd: null as null | ((r: unknown) => Promise<void>),
  pending: [] as Deferred[],
  invalidate: vi.fn(),
}));

vi.mock('@hello-pangea/dnd', () => {
  const provided = { innerRef: () => {}, droppableProps: {}, draggableProps: {}, dragHandleProps: {}, placeholder: null };
  return {
    DragDropContext: ({ onDragEnd, children }: { onDragEnd: (r: unknown) => Promise<void>; children: ReactNode }) => {
      mocks.onDragEnd = onDragEnd;
      return <>{children}</>;
    },
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) => <>{children(provided, {})}</>,
    Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) => <>{children(provided, {})}</>,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => new Promise((resolve) => { mocks.pending.push({ resolve }); }),
      }),
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContactKanbanView } from '../ContactKanbanView';

const CONTACT = { id: 'c1', name: 'Fulano', phone: '5511999999999', contact_type: 'cliente' };
const drag = (to: string) => ({ draggableId: 'c1', destination: { droppableId: to, index: 0 } });
const invalidatedKeys = () => mocks.invalidate.mock.calls.map(([a]) => (a as { queryKey: unknown[] }).queryKey[0]);

describe('ContactKanbanView — agregados após mover de coluna', () => {
  beforeEach(() => {
    mocks.onDragEnd = null;
    mocks.pending = [];
    mocks.invalidate.mockReset();
  });

  it('move bem-sucedido invalida contacts-kpi e contacts-type-counts', async () => {
    render(<ContactKanbanView contacts={[CONTACT]} onContactClick={() => {}} />);
    let done!: Promise<void>;
    act(() => { done = mocks.onDragEnd!(drag('fornecedor')); });
    await act(async () => { mocks.pending[0].resolve({ error: null }); await done; });
    expect(invalidatedKeys()).toEqual(expect.arrayContaining(['contacts-kpi', 'contacts-type-counts', 'contacts-search']));
  });

  it('drag superado que o banco aceitou invalida mesmo se o drag seguinte falhar', async () => {
    render(<ContactKanbanView contacts={[CONTACT]} onContactClick={() => {}} />);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = mocks.onDragEnd!(drag('fornecedor')); });
    act(() => { second = mocks.onDragEnd!(drag('parceiro')); });
    expect(mocks.pending).toHaveLength(2);

    await act(async () => { mocks.pending[0].resolve({ error: null }); await first; });
    await act(async () => { mocks.pending[1].resolve({ error: { message: 'falhou' } }); await second; });

    expect(invalidatedKeys()).toEqual(expect.arrayContaining(['contacts-kpi', 'contacts-type-counts', 'contacts-search']));
  });

  it('move que falhou não invalida', async () => {
    render(<ContactKanbanView contacts={[CONTACT]} onContactClick={() => {}} />);
    let done!: Promise<void>;
    act(() => { done = mocks.onDragEnd!(drag('fornecedor')); });
    await act(async () => { mocks.pending[0].resolve({ error: { message: 'x' } }); await done; });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});

/**
 * RD-086: o Pipeline é uma das "visões extras" e precisa do mesmo tratamento de
 * estado vazio do resto do módulo. Sem contato, a tela mostra o aviso em vez de
 * seis colunas vazias; com contato, o aviso não existe e as colunas seguem.
 */
describe('ContactKanbanView — estado vazio (RD-086)', () => {
  beforeEach(() => {
    mocks.onDragEnd = null;
    mocks.pending = [];
    mocks.invalidate.mockReset();
  });

  it('sem contatos mostra "Sem etapa comercial" e não monta as colunas', () => {
    const { getByTestId, queryByText } = render(<ContactKanbanView contacts={[]} onContactClick={() => {}} />);
    expect(getByTestId('contact-kanban-empty')).toBeInTheDocument();
    expect(screen.getByText('Sem etapa comercial')).toBeInTheDocument();
    // Nenhuma coluna do pipeline no estado vazio.
    expect(queryByText('Clientes')).not.toBeInTheDocument();
  });

  it('com contato esconde o aviso e mantém o cabeçalho da visão', () => {
    const { queryByTestId } = render(<ContactKanbanView contacts={[CONTACT]} onContactClick={() => {}} />);
    expect(queryByTestId('contact-kanban-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
  });
});
