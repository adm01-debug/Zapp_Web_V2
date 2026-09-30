import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { NotesTab } from '../NotesTab';
import type { ContactNote } from '@/hooks/crm/useContactNotes';

const mockUseContactNotes = vi.fn();
const mockUseMyWorkItems = vi.fn();
const mockUseContactSummaryNote = vi.fn();
const mockAddNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockToggleNoteDone = vi.fn();
const mockCreateTask = vi.fn();

vi.mock('@/hooks/crm/useContactNotes', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/crm/useContactNotes')>('@/hooks/crm/useContactNotes');
  return { ...actual, useContactNotes: (...args: unknown[]) => mockUseContactNotes(...args) };
});
// A aba Notas lê tarefas de useMyWorkItems (hook unificado). Mockar o hook antigo
// (@/hooks/chat/useConversationTasks) não tem efeito: o hook real rodava e estourava
// "useAuth must be used within an AuthProvider" nos 6 testes.
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: (...args: unknown[]) => mockUseMyWorkItems(...args),
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
  mockUseMyWorkItems.mockReturnValue({
    byDue: { overdue: openTasks, today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [], doneOlder: [] },
    create: mockCreateTask,
    isLoading: false,
  });
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

  it('mostra a data da pendencia no dia escolhido (data sem hora nao volta um dia)', () => {
    // O <input type="date"> grava new Date('2026-09-30').toISOString() = meia-noite UTC.
    const promise: ContactNote = { id: 'n4', contact_id: 'c1', author_id: 'me', content: 'Enviar proposta', category: 'promise', is_done: false, due_date: '2026-09-30T00:00:00.000Z', created_at: '2026-09-03T10:00:00Z', updated_at: '2026-09-03T10:00:00Z' };
    renderTab([promise]);

    expect(screen.getByText('30/09/2026')).toBeTruthy();
  });

  it('data com hora continua no fuso local (22:30 nao vira o dia seguinte)', () => {
    const at = new Date(2026, 8, 30, 22, 30).toISOString(); // em UTC-3 ja e 01:30Z de 01/10
    const promise: ContactNote = { id: 'n5', contact_id: 'c1', author_id: 'me', content: 'Ligar hoje', category: 'promise', is_done: false, due_date: at, created_at: '2026-09-03T10:00:00Z', updated_at: '2026-09-03T10:00:00Z' };
    renderTab([promise]);

    expect(screen.getByText('30/09/2026')).toBeTruthy();
  });

  it('pendências vazias mostram o empty state honesto', () => {
    renderTab([], []);
    expect(screen.getByText('Nenhuma pendência')).toBeInTheDocument();
  });

  it('adicionar uma pendência chama createTask com o contato', () => {
    renderTab([], []);
    const pendCard = screen.getByText('Pendências').closest('section') as HTMLElement;
    fireEvent.click(within(pendCard).getByText('+ Adicionar'));
    fireEvent.change(within(pendCard).getByPlaceholderText('Nova pendência...'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(within(pendCard).getByText('Salvar'));
    expect(mockCreateTask).toHaveBeenCalledWith({ title: 'Ligar amanhã', contactId: 'c1' });
  });

  it('lista as pendências que o hook devolve', () => {
    renderTab([], [{ id: 't1', title: 'Ligar amanhã', due_date: null }]);
    expect(screen.getByText('Ligar amanhã')).toBeInTheDocument();
  });
});
