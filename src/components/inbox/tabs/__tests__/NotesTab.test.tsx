import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { NotesTab } from '../NotesTab';
import type { ContactNote } from '@/hooks/crm/useContactNotes';

const mockUseContactNotes = vi.fn();
const mockUseConversationTasks = vi.fn();
const mockUseContactSummaryNote = vi.fn();
const mockAddNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockToggleNoteDone = vi.fn();
const mockCreateTask = vi.fn();

vi.mock('@/hooks/crm/useContactNotes', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/crm/useContactNotes')>('@/hooks/crm/useContactNotes');
  return { ...actual, useContactNotes: (...args: unknown[]) => mockUseContactNotes(...args) };
});
vi.mock('@/hooks/chat/useConversationTasks', () => ({
  useConversationTasks: (...args: unknown[]) => mockUseConversationTasks(...args),
}));
vi.mock('@/hooks/crm/useContactSummaryNote', () => ({
  useContactSummaryNote: (...args: unknown[]) => mockUseContactSummaryNote(...args),
}));

const NOTES: ContactNote[] = [
  { id: 'n1', contact_id: 'c1', author_id: 'me', content: 'nota qualquer', category: 'note', is_done: false, due_date: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
  { id: 'n2', contact_id: 'c1', author_id: 'me', content: '[Preço] acha caro', category: 'objection', is_done: false, due_date: null, created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' },
];

function renderTab(notes: ContactNote[] = NOTES, openTasks: Array<{ id: string; title: string; due_date: string | null }> = []) {
  mockUseContactNotes.mockReturnValue({
    allNotes: notes, addNote: mockAddNote, deleteNote: mockDeleteNote, toggleNoteDone: mockToggleNoteDone, currentProfileId: 'me',
  });
  mockUseConversationTasks.mockReturnValue({ open: openTasks, createTask: mockCreateTask });
  mockUseContactSummaryNote.mockReturnValue({ summary: '', isLoading: false, save: vi.fn(), isSaving: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotesTab contactId="c1" />
    </QueryClientProvider>
  );
}

describe('NotesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra a nota na categoria correta', () => {
    renderTab();
    expect(screen.getByText('nota qualquer')).toBeInTheDocument();
  });

  it('extrai a tag entre colchetes de uma objeção', () => {
    renderTab();
    expect(screen.getByText('Preço')).toBeInTheDocument();
    expect(screen.getByText(/acha caro/)).toBeInTheDocument();
  });

  it('adicionar um "Fato" chama addNote com category=fact', () => {
    renderTab([]);
    const factCard = screen.getByText('Fatos relevantes').closest('section') as HTMLElement;
    fireEvent.click(within(factCard).getByText('+ Adicionar'));
    fireEvent.change(within(factCard).getByPlaceholderText(/prefere contato/), { target: { value: 'Gosta de brindes personalizados' } });
    fireEvent.click(within(factCard).getByText('Salvar'));
    expect(mockAddNote).toHaveBeenCalledWith('Gosta de brindes personalizados', 'fact');
  });

  it('marcar uma promessa como feita chama toggleNoteDone', () => {
    const promise: ContactNote = { id: 'n3', contact_id: 'c1', author_id: 'me', content: 'Enviar catálogo', category: 'promise', is_done: false, due_date: null, created_at: '2026-09-03T10:00:00Z', updated_at: '2026-09-03T10:00:00Z' };
    renderTab([promise]);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(mockToggleNoteDone).toHaveBeenCalledWith(promise);
  });

  it('pendências vazias mostram o empty state honesto', () => {
    renderTab([], []);
    expect(screen.getByText('Nenhuma pendência')).toBeInTheDocument();
  });

  it('adicionar uma pendência chama createTask', () => {
    renderTab([], []);
    const pendCard = screen.getByText('Pendências').closest('section') as HTMLElement;
    fireEvent.click(within(pendCard).getByText('+ Adicionar'));
    fireEvent.change(within(pendCard).getByPlaceholderText('Nova pendência...'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(within(pendCard).getByText('Salvar'));
    expect(mockCreateTask).toHaveBeenCalledWith({ title: 'Ligar amanhã' });
  });
});
