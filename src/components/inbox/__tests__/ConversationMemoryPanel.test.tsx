import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConversationMemoryPanel } from '../ConversationMemoryPanel';

// Mocks hoisted: o client do Supabase é substituído por uma cadeia controlável.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      mocks.from(table);
      return {
        select: (columns: string) => {
          mocks.select(columns);
          return {
            eq: (column: string, value: string) => {
              mocks.eq(column, value);
              return { maybeSingle: () => mocks.maybeSingle() };
            },
          };
        },
        update: (payload: Record<string, unknown>) => {
          mocks.update(payload);
          type UpdateBuilder = { eq: (column: string, value: string) => UpdateBuilder };
          const builder: UpdateBuilder = {
            eq: (column: string, value: string) => {
              mocks.updateEq(column, value);
              return builder;
            },
          };
          return builder;
        },
        insert: (payload: Record<string, unknown>) => {
          mocks.insert(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const rowA = {
  id: 'mem-a',
  contact_id: 'contact-A',
  facts: ['Fato do contato A'],
  objections_handled: [],
  promises_made: [],
  pending_items: [],
  commercial_summary: 'Resumo A',
  cumulative_summary: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: null,
};

const emptyStateText = /Sem memória registrada/i;

describe('ConversationMemoryPanel — identidade da memória (IA-029)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('troca A→B sem memória não exibe a memória do contato A', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: rowA, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const { rerender } = render(<ConversationMemoryPanel contactId="contact-A" />);
    await waitFor(() => expect(screen.getByText('Fato do contato A')).toBeInTheDocument());

    rerender(<ConversationMemoryPanel contactId="contact-B" />);

    await waitFor(() => expect(screen.getByText(emptyStateText)).toBeInTheDocument());
    expect(screen.queryByText('Fato do contato A')).not.toBeInTheDocument();
    // A segunda consulta foi feita pelo contato B.
    expect(mocks.eq).toHaveBeenLastCalledWith('contact_id', 'contact-B');
  });

  it('resposta atrasada de A é ignorada depois de trocar para B', async () => {
    let resolveA!: (value: unknown) => void;
    const deferredA = new Promise(resolve => { resolveA = resolve; });

    mocks.maybeSingle
      .mockReturnValueOnce(deferredA)
      .mockResolvedValueOnce({ data: null, error: null });

    const { rerender } = render(<ConversationMemoryPanel contactId="contact-A" />);
    rerender(<ConversationMemoryPanel contactId="contact-B" />);
    await waitFor(() => expect(screen.getByText(emptyStateText)).toBeInTheDocument());

    // Resposta antiga chega atrasada: deve ser ignorada.
    await act(async () => {
      resolveA({ data: rowA, error: null });
      await Promise.resolve();
    });

    expect(screen.queryByText('Fato do contato A')).not.toBeInTheDocument();
    expect(screen.getByText(emptyStateText)).toBeInTheDocument();
  });

  it('distingue erro de ausência de registro', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for relation conversation_memory' },
    });

    render(<ConversationMemoryPanel contactId="contact-A" />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i));
    expect(screen.queryByText(emptyStateText)).not.toBeInTheDocument();
  });

  it('ausência de registro mostra estado vazio explícito, sem erro', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    render(<ConversationMemoryPanel contactId="contact-A" />);

    await waitFor(() => expect(screen.getByText(emptyStateText)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('update sempre carrega filtro por contact_id, nunca só por id', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: rowA, error: null });

    render(<ConversationMemoryPanel contactId="contact-A" />);
    await waitFor(() => expect(screen.getByText('Fato do contato A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'mem-a');
    expect(mocks.updateEq).toHaveBeenCalledWith('contact_id', 'contact-A');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ contact_id: 'contact-A' }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('memória cujo contact_id não é o atual não é atualizada (trata como ausência)', async () => {
    // Linha de OUTRO contato que por qualquer motivo veio no estado.
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...rowA, id: 'mem-de-outro', contact_id: 'contact-Z' },
      error: null,
    });

    render(<ConversationMemoryPanel contactId="contact-A" />);
    await waitFor(() => expect(screen.getByText(emptyStateText)).toBeInTheDocument());
  });
});
