import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * SL-082 — os itens que existiam no repositório mas não estavam LIGADOS no
 * painel ativo: o header recebia `showStats`/`onToggleStats`, `canTransfer`/
 * `onTransfer`, `isGroupCreator`/`onRenameGroup`/`onLeaveGroup` (o botão de
 * estatísticas nem era renderizado, porque `onToggleStats` chegava undefined), o
 * TTS gravava só no estado local (o handler que persiste em `user_settings` não
 * era passado) e `GroupManagementDialog`/`ParticipantStatsGraph` não tinham
 * nenhum chamador. Este teste trava cada ligação.
 */
const h = vi.hoisted(() => {
  const headerProps: { current: Record<string, unknown> } = { current: {} };
  const transferProps: { current: Record<string, unknown> } = { current: {} };

  const setShowStats = vi.fn();
  const setShowTransferDialog = vi.fn();
  const setShowGroupManagement = vi.fn();
  const handleRenameGroup = vi.fn();
  const handleRemoveMember = vi.fn();
  const handleLeaveGroup = vi.fn();
  const handleDeleteGroup = vi.fn();
  const handleVoiceChange = vi.fn();
  const handleSpeedChange = vi.fn();
  const ttsSetVoiceId = vi.fn();
  const ttsSetSpeed = vi.fn();

  const panel: Record<string, unknown> = {
    profile: { id: 'user-1', role: 'admin' },
    messages: [],
    filteredMessages: [],
    isSearching: false,
    searchError: null as string | null,
    isLoading: false,
    isMuted: false,
    isFetchingOlder: false,
    hasOlderMessages: false,
    fetchOlderMessages: vi.fn(),
    showStats: false,
    setShowStats,
    showTransferDialog: false,
    setShowTransferDialog,
    showGroupManagement: false,
    setShowGroupManagement,
    canTransfer: true,
    isGroupCreator: true,
    renameConvMutation: { isPending: false },
    removeMemberMutation: { isPending: false },
    leaveMutation: { isPending: false },
    deleteConvMutation: { isPending: false },
    handleRenameGroup,
    handleRemoveMember,
    handleLeaveGroup,
    handleDeleteGroup,
    handleVoiceChange,
    handleSpeedChange,
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
    sendMutation: { isPending: false },
    muteMutation: { mutate: vi.fn() },
    tts: {
      speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
      currentMessageId: null, voiceId: 'v1', setVoiceId: ttsSetVoiceId, speed: 1, setSpeed: ttsSetSpeed,
    },
    reactions: { aggregate: () => [], toggle: vi.fn() },
  };

  return {
    panel, headerProps, transferProps,
    setShowStats, setShowTransferDialog, setShowGroupManagement,
    handleRenameGroup, handleRemoveMember, handleLeaveGroup, handleDeleteGroup,
    handleVoiceChange, handleSpeedChange, ttsSetVoiceId, ttsSetSpeed,
  };
});

vi.mock('../useTeamChatPanel', () => ({
  useTeamChatPanel: () => h.panel,
}));

vi.mock('../TeamChatHeader', () => ({
  TeamChatHeader: (props: Record<string, unknown>) => {
    h.headerProps.current = props;
    return <div data-testid="header" />;
  },
}));

vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));
vi.mock('../TransferConversationDialog', () => ({
  TransferConversationDialog: (props: Record<string, unknown>) => {
    h.transferProps.current = props;
    return <div data-testid="transfer-dialog" />;
  },
}));

vi.mock('@/hooks/team-chat/useParticipantStats', () => ({
  useParticipantStats: () => ({
    data: [{ senderId: 'user-2', senderName: 'Ana Souza', sent: 4, delivered: 3, read: 2 }],
    isLoading: false,
  }),
}));

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

describe('TeamChatPanel — itens existentes ligados no painel ativo (SL-082)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.panel.showStats = false;
    h.panel.showTransferDialog = false;
    h.panel.showGroupManagement = false;
    h.panel.showSearch = false;
    h.panel.searchQuery = '';
    h.panel.isSearching = false;
    h.panel.searchError = null;
    h.panel.filteredMessages = [];
    h.panel.hasOlderMessages = false;
    h.panel.isFetchingOlder = false;
  });

  it('liga o botão de estatísticas no header e o slot de estatísticas no corpo', () => {
    const { rerender } = renderPanel();
    expect(h.headerProps.current.onToggleStats).toBeTypeOf('function');
    expect(screen.queryByText('Participantes')).not.toBeInTheDocument();

    h.panel.showStats = true;
    rerender(<TeamChatPanel conversation={conversation} onBack={() => {}} />);
    expect(screen.getByText('Participantes')).toBeInTheDocument();

    // O botão do header alterna o slot: com o painel aberto, o clique fecha.
    (h.headerProps.current.onToggleStats as () => void)();
    expect(h.setShowStats).toHaveBeenCalledWith(false);
  });

  it('liga transferir, renomear e sair do grupo no header', () => {
    renderPanel();

    expect(h.headerProps.current.canTransfer).toBe(true);
    expect(h.headerProps.current.isGroupCreator).toBe(true);

    (h.headerProps.current.onTransfer as () => void)();
    expect(h.setShowTransferDialog).toHaveBeenCalledWith(true);

    (h.headerProps.current.onRenameGroup as () => void)();
    (h.headerProps.current.onLeaveGroup as () => void)();
    expect(h.setShowGroupManagement).toHaveBeenCalledTimes(2);
  });

  it('TTS: o header grava a preferência pelo handler do painel, não pelo estado local', () => {
    renderPanel();

    (h.headerProps.current.onVoiceChange as (v: string) => void)('voz-nova');
    (h.headerProps.current.onSpeedChange as (s: number) => void)(1.5);

    expect(h.handleVoiceChange).toHaveBeenCalledWith('voz-nova');
    expect(h.handleSpeedChange).toHaveBeenCalledWith(1.5);
    expect(h.ttsSetVoiceId).not.toHaveBeenCalled();
    expect(h.ttsSetSpeed).not.toHaveBeenCalled();
  });

  it('abre o GroupManagementDialog com renomear e excluir ligados ao painel', () => {
    h.panel.showGroupManagement = true;
    renderPanel();

    expect(screen.getByText('Gerenciar grupo')).toBeInTheDocument();
    // "Excluir grupo" só existe quando `isGroupCreator` e `onDelete` chegaram ao diálogo.
    expect(screen.getByRole('button', { name: /Excluir grupo/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Time Comercial 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(h.handleRenameGroup).toHaveBeenCalledWith('Time Comercial 2');
  });

  it('abre o TransferConversationDialog com a conversa e o usuário atual', () => {
    h.panel.showTransferDialog = true;
    renderPanel();

    expect(h.transferProps.current.open).toBe(true);
    expect(h.transferProps.current.currentUserId).toBe('user-1');
    expect((h.transferProps.current.conversation as TeamConversation).id).toBe('conv-a');
  });

  it('durante a busca mostra "Buscando mensagens…" em vez de "Nenhuma mensagem encontrada"', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.isSearching = true;
    renderPanel();

    expect(screen.getByText(/Buscando mensagens/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma mensagem encontrada')).not.toBeInTheDocument();
  });

  it('o spinner da busca respeita reduzir movimento (motion-safe, nunca animate-spin solto)', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.isSearching = true;
    renderPanel();

    const spinner = screen.getByText(/Buscando mensagens/).parentElement?.querySelector('svg');
    expect(spinner).not.toBeNull();
    const classes = (spinner?.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('motion-safe:animate-spin');
    // `animate-spin` solto ignora quem pediu menos movimento na máquina.
    expect(classes).not.toContain('animate-spin');
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
    }] as unknown as typeof h.panel.filteredMessages;
    renderPanel();

    const spinner = screen.getByText('Carregar mensagens anteriores')
      .closest('button')?.querySelector('svg');
    expect(spinner).toBeTruthy();
    const classes = (spinner?.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('motion-safe:animate-spin');
    expect(classes).not.toContain('animate-spin');
  });

  it('falha da busca aparece como aviso de erro, não como "Nenhuma mensagem encontrada"', () => {
    h.panel.showSearch = true;
    h.panel.searchQuery = 'contrato';
    h.panel.searchError = 'Não foi possível buscar as mensagens. Tente novamente.';
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar as mensagens. Tente novamente.');
    expect(screen.queryByText('Nenhuma mensagem encontrada')).not.toBeInTheDocument();
    expect(screen.queryByText(/Buscando mensagens/)).not.toBeInTheDocument();
    // O contador não anuncia "0 resultados" junto com o aviso de falha.
    expect(screen.queryByText(/0 resultado/)).not.toBeInTheDocument();
  });
});
