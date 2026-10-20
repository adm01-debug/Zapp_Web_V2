import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * TC-006 — paginação, reações e ticks existiam parcialmente FORA do Panel
 * ativo: o hook tinha `fetchOlderMessages`/`oldestCursor` prontos (mas nada no
 * Panel os chamava), o `useTeamMessageReactions` era carregado (mas o Panel não
 * renderizava reação nenhuma) e o `TeamMessageItem` (com reações e o tick de
 * leitura via `MessageStatus`) não era composto pelo Panel, que mantinha o
 * markup inline. Este teste trava o wiring: o Panel precisa renderizar os
 * componentes existentes e ligar a paginação ao scroll.
 */
const h = vi.hoisted(() => {
  const fetchOlderMessages = vi.fn();
  const toggleReaction = vi.fn();
  const checkNearBottom = vi.fn();
  const scrollRef: { current: HTMLDivElement | null } = { current: null };
  const searchInputRef: { current: HTMLInputElement | null } = { current: null };
  const isNearBottomRef = { current: true };

  const messages = [
    {
      id: 'm-1', conversation_id: 'conv-a', sender_id: 'user-2', content: 'oi',
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null,
      is_edited: false, status: 'sent', created_at: '2026-10-04T10:00:00+00:00',
      updated_at: '2026-10-04T10:00:00+00:00', sender: { id: 'user-2', name: 'Outro', avatar_url: null },
    },
    {
      id: 'm-2', conversation_id: 'conv-a', sender_id: 'user-1', content: 'minha',
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null,
      is_edited: false, status: 'read', created_at: '2026-10-04T10:05:00+00:00',
      updated_at: '2026-10-04T10:05:00+00:00', sender: { id: 'user-1', name: 'Eu', avatar_url: null },
    },
  ];

  const reactionsByMessage: Record<string, unknown[]> = {
    'm-1': [{ emoji: '👍', count: 1, reactedByMe: false, profileIds: ['user-2'] }],
  };

  const panel = {
    profile: { id: 'user-1', role: 'admin' },
    messages,
    filteredMessages: messages,
    isLoading: false,
    isMuted: false,
    isFetchingOlder: false,
    hasOlderMessages: true,
    fetchOlderMessages,
    showScrollDown: false,
    text: '', setText: vi.fn(), replyTo: null, setReplyTo: vi.fn(),
    editingId: null, editText: '', setEditText: vi.fn(),
    showSearch: false, setShowSearch: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
    showAddMembers: false, setShowAddMembers: vi.fn(),
    isRecordingAudio: false, setIsRecordingAudio: vi.fn(),
    scrollRef, searchInputRef, isNearBottomRef,
    checkNearBottom, scrollToBottom: vi.fn(),
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
    reactions: {
      aggregate: (id: string) => reactionsByMessage[id] ?? [],
      toggle: toggleReaction,
    },
  };

  return { fetchOlderMessages, toggleReaction, checkNearBottom, panel };
});

vi.mock('../useTeamChatPanel', () => ({
  useTeamChatPanel: () => h.panel,
}));

vi.mock('../TeamChatHeader', () => ({ TeamChatHeader: () => <div data-testid="header" /> }));
vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
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

const conversation = { id: 'conv-a', type: 'group' } as TeamConversation;

function renderPanel() {
  return render(<TeamChatPanel conversation={conversation} onBack={() => {}} />);
}

describe('TeamChatPanel — paginação, reações e ticks dentro do Panel ativo (TC-006)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza as reações da mensagem (componente de reação composto no Panel)', () => {
    renderPanel();
    // O badge de reação só existe se o Panel renderizar TeamMessageItem e passar
    // o agregado de useTeamMessageReactions.
    expect(screen.getByLabelText('👍 1 reação')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Reação rápida').length).toBeGreaterThan(0);
  });

  it('renderiza o tick de leitura das mensagens próprias (MessageStatus no Panel)', () => {
    const { container } = renderPanel();
    expect(container.querySelector('svg.lucide-check-check')).toBeTruthy();
  });

  it('dispara a paginação ao rolar até o topo da lista', () => {
    renderPanel();
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollTop', { value: 0, writable: true, configurable: true });
    fireEvent.scroll(log);
    expect(h.checkNearBottom).toHaveBeenCalled();
    expect(h.fetchOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('oferece um botão acessível para carregar mensagens anteriores', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Carregar mensagens anteriores/ }));
    expect(h.fetchOlderMessages).toHaveBeenCalledTimes(1);
  });
});
