import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NotesTab } from '../NotesTab';
import type { ContactNote } from '@/hooks/crm/useContactNotes';

const mockUseContactNotes = vi.fn();
const mockUseMyWorkItems = vi.fn();
const mockUseContactSummaryNote = vi.fn();
const mockAddNote = vi.fn();
const mockAddAudioNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockToggleNoteDone = vi.fn();

// Controle dos hooks de captura: capturamos as opções para simular gravação/ditado.
let recorderOptions: { onRecordingComplete?: (blob: Blob) => void } = {};
let speechOptions: { onResult?: (text: string) => void } = {};

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
vi.mock('@/hooks/communication/useAudioRecorder', () => ({
  useAudioRecorder: (opts: { onRecordingComplete?: (blob: Blob) => void } = {}) => {
    recorderOptions = opts;
    return {
      isRecording: false,
      duration: 0,
      audioUrl: 'blob:preview',
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      uploadAudio: vi.fn(),
      formatDuration: () => '0:00',
    };
  },
}));
vi.mock('@/hooks/communication/useSpeechToText', () => ({
  useSpeechToText: (opts: { onResult?: (text: string) => void } = {}) => {
    speechOptions = opts;
    return { isListening: false, isSupported: true, transcript: '', toggleListening: vi.fn() };
  },
}));
vi.mock('@/hooks/communication/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    audioRef: { current: null },
    resolvedUrl: '',
    isPlaying: false,
    isLoading: false,
    hasError: false,
    progress: 0,
    duration: 0,
    currentTime: 0,
    togglePlay: vi.fn(),
    formatTime: () => '0:00',
  }),
}));
vi.mock('@/components/inbox/VoiceChanger', () => ({ VoiceChanger: () => null }));

const notesKey = (): ContactNote[] => [];

function renderTab(notes: ContactNote[] = notesKey()) {
  mockUseContactNotes.mockReturnValue({
    allNotes: notes, addNote: mockAddNote, addAudioNote: mockAddAudioNote,
    deleteNote: mockDeleteNote, toggleNoteDone: mockToggleNoteDone, currentProfileId: 'me',
  });
  mockUseMyWorkItems.mockReturnValue({
    byDue: { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [], doneOlder: [] },
    create: vi.fn(), isLoading: false,
  });
  mockUseContactSummaryNote.mockReturnValue({ summary: '', isLoading: false, save: vi.fn(), isSaving: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <NotesTab contactId="c1" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function openPrivateNotes(): HTMLElement {
  const card = screen.getByText('Notas privadas').closest('section') as HTMLElement;
  fireEvent.click(within(card).getByText('+ Adicionar'));
  return card;
}

describe('NotesTab — áudio e ditado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorderOptions = {};
    speechOptions = {};
  });

  it('caminho 1 — nota de texto continua funcionando', () => {
    renderTab();
    const card = openPrivateNotes();
    fireEvent.change(within(card).getByPlaceholderText(/nota privada/i), { target: { value: 'Cliente pediu retorno' } });
    fireEvent.click(within(card).getByText('Salvar'));
    expect(mockAddNote).toHaveBeenCalledWith('Cliente pediu retorno', 'note');
  });

  it('caminho 2 — gravar áudio salva a nota com o blob e a categoria', () => {
    renderTab();
    const card = openPrivateNotes();

    fireEvent.click(within(card).getByLabelText('Gravar nota de áudio'));
    const blob = new Blob(['voz'], { type: 'audio/webm' });
    act(() => { recorderOptions.onRecordingComplete?.(blob); });

    fireEvent.click(within(card).getByLabelText('Enviar áudio'));
    expect(mockAddAudioNote).toHaveBeenCalledWith(blob, 'note');
  });

  it('caminho 2 (reprodução) — nota de voz aparece com o player no card', () => {
    const audioNote: ContactNote = {
      id: 'aud1', contact_id: 'c1', author_id: 'me', content: '', category: 'note', is_done: false,
      due_date: null, created_at: '2026-09-10T10:00:00Z', updated_at: '2026-09-10T10:00:00Z',
      audio_url: 'https://exemplo.test/storage/v1/object/public/whatsapp-media/c1/a.webm',
    };
    renderTab([audioNote]);
    expect(screen.getByTestId('note-audio-player')).toBeInTheDocument();
    expect(screen.getByLabelText('Tocar áudio da nota')).toBeInTheDocument();
  });

  it('caminho 3 — ditar preenche o campo e o texto é salvo', () => {
    renderTab();
    const card = openPrivateNotes();

    fireEvent.click(within(card).getByLabelText('Ditar mensagem'));
    act(() => { speechOptions.onResult?.('texto ditado por voz'); });

    expect(within(card).getByPlaceholderText(/nota privada/i)).toHaveValue('texto ditado por voz');
    fireEvent.click(within(card).getByText('Salvar'));
    expect(mockAddNote).toHaveBeenCalledWith('texto ditado por voz', 'note');
  });
});
