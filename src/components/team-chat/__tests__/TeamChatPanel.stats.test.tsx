import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * E70/E72/E78 — os dois painéis de estatística existiam órfãos e o botão do
 * cabeçalho nunca aparecia (os dois `<TeamChatHeader>` do Panel não passavam
 * `onToggleStats`). Este teste trava o wiring pelo componente REAL do
 * cabeçalho: o botão existe, alterna o slot e os dois painéis aparecem dentro
 * dele. O canal protegido (não membro) segue sem o botão.
 */
const h = vi.hoisted(() => {
  const panel = {
    profile: { id: 'user-1', role: 'admin', department_id: 'dept-1' },
    messages: [],
    filteredMessages: [],
    isLoading: false,
    isMuted: false,
    isFetchingOlder: false,
    hasOlderMessages: false,
    fetchOlderMessages: vi.fn(),
    showScrollDown: false,
    text: '', setText: vi.fn(), replyTo: null, setReplyTo: vi.fn(),
    editingId: null, editText: '', setEditText: vi.fn(),
    showSearch: false, setShowSearch: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
    isSearching: false, searchError: null,
    showStats: false, setShowStats: vi.fn(),
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
      currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
    },
    reactions: { aggregate: () => [], toggle: vi.fn() },
  };
  return { panel, setShowStats: panel.setShowStats };
});

vi.mock('../useTeamChatPanel', () => ({ useTeamChatPanel: () => h.panel }));
vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));
vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => ({ url: '', isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/hooks/communication/useMediaElementVolume', () => ({
  useMediaElementVolume: () => ({}),
}));
vi.mock('@/hooks/team-chat/useParticipantStats', () => ({
  useParticipantStats: () => ({
    data: [{ senderId: 'u1', senderName: 'Ana Souza', sent: 4, delivered: 3, read: 2 }],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/team-chat/useTeamPerformance', () => ({
  useTeamPerformance: () => ({
    data: { messageCount: 42, activeParticipants: 3, avgResponseTimeMs: 1500 },
    isLoading: false,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

const conversaGrupo = { id: 'conv-a', type: 'group' } as TeamConversation;
const conversaCanal = { id: 'conv-b', type: 'group', department_id: 'dept-9' } as unknown as TeamConversation;

const renderPanel = (conversation: TeamConversation) =>
  render(
    <TooltipProvider>
      <TeamChatPanel conversation={conversation} onBack={() => {}} />
    </TooltipProvider>,
  );

describe('TeamChatPanel — estatísticas visíveis pelo botão do cabeçalho (E70/E72/E78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.panel.showStats = false;
  });

  it('mostra o botão Ver estatísticas no cabeçalho real', () => {
    renderPanel(conversaGrupo);

    const botao = screen.getByLabelText('Ver estatísticas');
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('team-chat-stats')).toBeNull();
  });

  it('clicar no botão liga o slot de estatísticas', () => {
    renderPanel(conversaGrupo);

    fireEvent.click(screen.getByLabelText('Ver estatísticas'));

    expect(h.setShowStats).toHaveBeenCalledWith(true);
  });

  it('com o slot ligado renderiza os dois painéis', () => {
    h.panel.showStats = true;
    renderPanel(conversaGrupo);

    expect(screen.getByTestId('team-chat-stats')).toBeInTheDocument();
    expect(screen.getByLabelText('Fechar estatísticas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Participantes')).toBeInTheDocument();
    expect(screen.getByText('Performance (últimos 30 min)')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('não oferece estatísticas no canal protegido (não membro)', () => {
    renderPanel(conversaCanal);

    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ver estatísticas')).toBeNull();
  });
});
