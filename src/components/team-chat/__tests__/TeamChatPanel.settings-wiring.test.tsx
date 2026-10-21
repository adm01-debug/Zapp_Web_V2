import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * SL-082 — teste de tela mantido só para o que este refazer precisa provar na
 * ponta atual: a busca pendente não anuncia resultado vazio, o erro válido vira
 * aviso, e os spinners continuam com `motion-safe:animate-spin`. A ponta do dia
 * removeu os testes antigos de settings/transfer/group-management; reintroduzir
 * esses contratos aqui seria trazer diff de outro cartão durante a retomada.
 */
const h = vi.hoisted(() => {
  const panel: Record<string, unknown> = {
    profile: { id: 'user-1', role: 'admin' },
    messages: [],
    filteredMessages: [],
    isSearching: false,
    searchError: false,
    searchErrorMessage: null as string | null,
    isLoading: false,
    isMuted: false,
    isFetchingOlder: false,
    hasOlderMessages: false,
    fetchOlderMessages: vi.fn(),
    showStats: false,
    setShowStats: vi.fn(),
    showTransferDialog: false,
    setShowTransferDialog: vi.fn(),
    showGroupManagement: false,
    setShowGroupManagement: vi.fn(),
    canTransfer: true,
    isGroupCreator: true,
    renameConvMutation: { isPending: false },
    removeMemberMutation: { isPending: false },
    leaveMutation: { isPending: false },
    deleteConvMutation: { isPending: false },
    showScrollDown: false,
    text: '', setText: vi.fn(), replyTo: null, setReplyTo: vi.fn(),
    editingId: null, editText: '', setEditText: vi.fn(),
    showSearch: false, setShowSearch: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
    showAddMembers: false, setShowAddMembers: vi.fn(),
    isRecordingAudio: false, setIsRecordingAudio: vi.fn(),
    scrollRef: { current: null }, searchInputRef: { current: null }, isNearBottomRef: { current: true },
    checkNearBottom: vi.fn(), scrollToBottom: vi.fn(),
    handleSend: vi.fn(), handleDelete: vi.fn(), handleStartEdit: vi.fn(),
    handleSaveEdit: vi.fn(), handleCancelEdit: vi.fn(), handleCopyMessage: vi.fn(),
    handleAudioSend: vi.fn(), handleFileSent: vi.fn(), handleSendSticker: vi.fn(),
    handleSendAudioMeme: vi.fn(), handleSendCustomEmoji: vi.fn(),
    handleVoiceChange: vi.fn(), handleSpeedChange: vi.fn(),
    sendMutation: { isPending: false },
    muteMutation: { mutate: vi.fn() },
    tts: {
      speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
      currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
    },
    reactions: { aggregate: () => [], toggle: vi.fn() },
  };

  return { panel };
});

vi.mock('../useTeamChatPanel', () => ({
  useTeamChatPanel: () => h.panel,
}));

vi.mock('../TeamChatHeader', () => ({ TeamChatHeader: () => <div data-testid="header" /> }));
vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
vi.mock('../TeamMessageItem', () => ({ TeamMessageItem: ({ msg }: { msg: { content?: string } }) => <div>{msg.content}</div> }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));
vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => ({ url: '', isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({}),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

const conversation = { id: 'conv-a', type: 'group', name: 'Time Comercial', created_by: 'user-1' } as TeamConversation;

function renderPanel() {
  return render(<TeamChatPanel conversation={conversation} onBack={() => {}} />);
}

describe('TeamChatPanel — estados visuais da busca (SL-082)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.panel.showSearch = false;
    h.panel.searchQuery = '';
    h.panel.isSearching = false;
    h.panel.searchError = false;
    h.panel.searchErrorMessage = null;
    h.panel.filteredMessages = [];
    h.panel.hasOlderMessages = false;
    h.panel.isFetchingOlder = false;
  });

  it('durante a busca mostra "Buscando mensagens…" em vez de "Nenhuma mensagem encontrada"', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.isSearching = true;
    renderPanel();

    expect(screen.getByText(/Buscando mensagens/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma mensagem encontrada')).not.toBeInTheDocument();
  });

  it('o spinner da busca respeita reduzir movimento (motion-safe:)', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.isSearching = true;
    renderPanel();

    const spinner = screen.getByText(/Buscando mensagens/).parentElement?.querySelector('svg');
    expect(spinner).not.toBeNull();
    const classes = (spinner?.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('motion-safe:animate-spin');
    expect(classes.filter(c => c.includes(':animate-spin'))).toEqual(['motion-safe:animate-spin']);
  });

  it('o spinner do "Carregar mensagens anteriores" também respeita reduzir movimento', () => {
    h.panel.hasOlderMessages = true;
    h.panel.isFetchingOlder = true;
    h.panel.filteredMessages = [{
      id: 'm-1', conversation_id: 'conv-a', sender_id: 'user-2', content: 'bom dia',
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null,
      is_edited: false, status: 'sent', created_at: '2026-10-08T12:00:00+00:00',
      updated_at: '2026-10-08T12:00:00+00:00',
      sender: { id: 'user-2', name: 'Bia', avatar_url: null },
    }];
    renderPanel();

    const spinner = screen.getByText('Carregar mensagens anteriores')
      .closest('button')?.querySelector('svg');
    expect(spinner).toBeTruthy();
    const classes = (spinner?.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('motion-safe:animate-spin');
    expect(classes.filter(c => c.includes(':animate-spin'))).toEqual(['motion-safe:animate-spin']);
  });

  it('falha da busca aparece como aviso de erro, não como "Nenhuma mensagem encontrada"', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.searchError = true;
    h.panel.searchErrorMessage = 'Não foi possível buscar as mensagens. Tente novamente.';
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar as mensagens. Tente novamente.');
    expect(screen.queryByText('Nenhuma mensagem encontrada')).not.toBeInTheDocument();
    expect(screen.queryByText(/Buscando mensagens/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 resultado/)).not.toBeInTheDocument();
  });
});
