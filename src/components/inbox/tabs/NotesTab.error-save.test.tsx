import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import { NotesTab } from './NotesTab';
import type { ContactNote } from '@/hooks/crm/useContactNotes';

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));

const mockUseContactNotes = vi.fn();
const mockUseMyWorkItems = vi.fn();
const mockUseContactSummaryNote = vi.fn();
const mockAddNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockRefetch = vi.fn();
const mockToggleNoteDone = vi.fn();
const mockSaveSummary = vi.fn();

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
vi.mock('@/hooks/ui/use-toast', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/ui/use-toast')>('@/hooks/ui/use-toast');
  return { ...actual, toast: (...args: unknown[]) => mockToast(...args) };
});

function makeNote(over: Partial<ContactNote> = {}): ContactNote {
  return {
    id: 'n1',
    contact_id: 'c1',
    author_id: 'me',
    content: 'Nota existente',
    category: 'note',
    is_done: false,
    due_date: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
    author: { id: 'me', name: 'Eu', avatar_url: null },
    ...over,
  };
}

function renderTab(notes: ContactNote[] = [], hook: Record<string, unknown> = {}) {
  mockUseContactNotes.mockReturnValue({
    allNotes: notes,
    addNote: mockAddNote,
    deleteNote: mockDeleteNote,
    toggleNoteDone: mockToggleNoteDone,
    currentProfileId: 'me',
    isLoading: false,
    error: null,
    refetch: mockRefetch,
    ...hook,
  });
  mockUseMyWorkItems.mockReturnValue({
    byDue: { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [], doneOlder: [] },
    create: vi.fn(),
    isLoading: false,
  });
  mockUseContactSummaryNote.mockReturnValue({
    summary: 'Resumo antigo',
    isLoading: false,
    save: mockSaveSummary,
    isSaving: false,
  });
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

function cardOf(title: string) {
  return screen.getByText(title).closest('section') as HTMLElement;
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

describe('NotesTab — estados de leitura das notas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('erro do hook vira alerta com "Tentar novamente" chamando refetch, e não vira lista vazia', async () => {
    const { container } = renderTab([], { error: new Error('RLS negou a leitura') });

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent(/não foi possível carregar/i);

    // A falha não pode ser comunicada como "nenhum registro".
    expect(screen.queryByText('Nenhum registro ainda')).toBeNull();

    fireEvent.click(within(alerta).getByRole('button', { name: /tentar novamente/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('enquanto carrega mostra esqueleto e não afirma que está vazio', () => {
    renderTab([], { isLoading: true });

    const skeletons = screen.getAllByTestId('notes-skeleton');
    expect(skeletons).toHaveLength(4);
    expect(skeletons[0]).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Nenhum registro ainda')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('NotesTab — resumo comercial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falha ao salvar mantém o editor aberto com o texto e avisa por toast', async () => {
    mockSaveSummary.mockRejectedValue(new Error('falha ao gravar'));
    renderTab();
    const card = cardOf('Resumo comercial');

    fireEvent.click(within(card).getByText('Editar'));
    const textarea = within(card).getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Resumo novo que não pode sumir' } });
    fireEvent.click(within(card).getByText('Salvar'));

    await waitFor(() => expect(mockSaveSummary).toHaveBeenCalledWith('Resumo novo que não pode sumir'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));

    // Editor segue aberto, com o texto digitado, para nova tentativa.
    const depois = within(card).getByRole('textbox') as HTMLTextAreaElement;
    expect(depois.value).toBe('Resumo novo que não pode sumir');
    expect(within(card).getByText('Salvar')).toBeInTheDocument();
  });
});

describe('NotesTab — nomes acessíveis nos controles só com ícone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('as lixeiras têm nome acessível e removem a nota certa', () => {
    renderTab([
      makeNote({ id: 'n1', category: 'note', content: 'Nota' }),
      makeNote({ id: 'o1', category: 'objection', content: '[Preço] Acha caro' }),
      makeNote({ id: 'p1', category: 'promise', content: 'Enviar catálogo' }),
    ]);

    const lixeiras = screen.getAllByRole('button', { name: /remover (nota|objeção|promessa)/i });
    expect(lixeiras).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Remover nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover objeção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover promessa' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover nota' }));
    expect(mockDeleteNote).toHaveBeenCalledWith('n1');
  });

  it('o checkbox da promessa tem nome acessível e alterna o estado', () => {
    const promise = makeNote({ id: 'p1', category: 'promise', content: 'Enviar catálogo' });
    renderTab([promise]);

    const checkbox = screen.getByRole('checkbox', { name: 'Marcar promessa como concluída' });
    fireEvent.click(checkbox);
    expect(mockToggleNoteDone).toHaveBeenCalledWith(promise);
  });
});
