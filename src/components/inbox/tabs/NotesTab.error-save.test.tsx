import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { NotesTab } from './NotesTab';

const mockUseContactNotes = vi.fn();
const mockUseMyWorkItems = vi.fn();
const mockUseContactSummaryNote = vi.fn();
const mockAddNote = vi.fn();

vi.mock('@/hooks/crm/useContactNotes', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/crm/useContactNotes')>('@/hooks/crm/useContactNotes');
  return { ...actual, useContactNotes: (...args: unknown[]) => mockUseContactNotes(...args) };
});
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: (...args: unknown[]) => mockUseMyWorkItems(...args),
}));
vi.mock('@/hooks/crm/useContactSummaryNote', () => ({
  useContactSummaryNote: (...args: unknown[]) => mockUseContactSummaryNote(...args),
}));

function renderTab() {
  mockUseContactNotes.mockReturnValue({
    allNotes: [], addNote: mockAddNote, deleteNote: vi.fn(), toggleNoteDone: vi.fn(), currentProfileId: 'me',
  });
  mockUseMyWorkItems.mockReturnValue({
    byDue: { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [], doneOlder: [] },
    create: vi.fn(),
    isLoading: false,
  });
  mockUseContactSummaryNote.mockReturnValue({ summary: '', isLoading: false, save: vi.fn(), isSaving: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotesTab contactId="c1" />
    </QueryClientProvider>,
  );
}

/** Abre o editor de "Notas privadas" e devolve o card e a caixa de texto. */
function openPrivateNoteEditor() {
  const card = screen.getByText('Notas privadas').closest('section') as HTMLElement;
  fireEvent.click(within(card).getByText('+ Adicionar'));
  const textarea = within(card).getByPlaceholderText(/escreva uma nota privada/i) as HTMLTextAreaElement;
  return { card, textarea };
}

describe('NotesTab — gravação de nota não descarta o rascunho', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém o texto digitado e o formulário aberto quando onAdd rejeita', async () => {
    mockAddNote.mockRejectedValue(new Error('falha ao gravar'));
    renderTab();
    const { card, textarea } = openPrivateNoteEditor();

    fireEvent.change(textarea, { target: { value: 'Rascunho que não pode sumir' } });
    fireEvent.click(within(card).getByText('Salvar'));

    await waitFor(() => expect(mockAddNote).toHaveBeenCalledTimes(1));

    // O formulário continua aberto e o texto segue lá para o usuário tentar de novo.
    await waitFor(() => expect(card.querySelector('textarea')).not.toBeNull());
    expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Rascunho que não pode sumir');
    expect(within(card).getByText('Salvar')).toBeInTheDocument();
  });

  it('limpa o campo e fecha o formulário quando a gravação resolve', async () => {
    mockAddNote.mockResolvedValue(undefined);
    renderTab();
    const { card, textarea } = openPrivateNoteEditor();

    fireEvent.change(textarea, { target: { value: 'Nota salva' } });
    fireEvent.click(within(card).getByText('Salvar'));

    // Só depois da confirmação: o editor some e o botão "+ Adicionar" volta.
    await waitFor(() => expect(card.querySelector('textarea')).toBeNull());
    expect(within(card).queryByText('Salvar')).toBeNull();
    expect(within(card).getByText('+ Adicionar')).toBeInTheDocument();

    // Reabrir mostra o campo vazio — o rascunho não ficou para trás.
    fireEvent.click(within(card).getByText('+ Adicionar'));
    const reopened = within(card).getByPlaceholderText(/escreva uma nota privada/i) as HTMLTextAreaElement;
    expect(reopened.value).toBe('');
  });
});
