import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * B7 — na visão bloqueada (não-membro do canal de departamento) o Panel passava
 * `() => {}` para busca, adicionar membros e silenciar, e o cabeçalho mostrava
 * esses botões mesmo assim: o clique não fazia nada. Para não-membro os botões
 * não podem aparecer; para membro continuam ligados às ações reais.
 */
const h = vi.hoisted(() => {
  const headerProps: { current: Record<string, unknown> | null } = { current: null };
  const panel = {
    profile: { id: 'user-1', department_id: 'dep-vendas' },
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
  return { headerProps, panel };
});

vi.mock('../useTeamChatPanel', () => ({ useTeamChatPanel: () => h.panel }));
vi.mock('../TeamChatHeader', async (importOriginal) => {
  const real = await importOriginal<typeof import('../TeamChatHeader')>();
  return {
    TeamChatHeader: (props: Parameters<typeof real.TeamChatHeader>[0]) => {
      h.headerProps.current = props as unknown as Record<string, unknown>;
      return <real.TeamChatHeader {...props} />;
    },
  };
});
vi.mock('../MoveDepartmentDialog', () => ({ MoveDepartmentDialog: () => null }));
vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

function renderPanel(departmentId: string) {
  const conversation = { id: 'conv-a', type: 'group', name: 'Canal', department_id: departmentId } as unknown as TeamConversation;
  return render(
    <TooltipProvider>
      <TeamChatPanel conversation={conversation} onBack={() => {}} />
    </TooltipProvider>,
  );
}

describe('TeamChatPanel — cabeçalho na visão bloqueada (B7)', () => {
  beforeEach(() => { h.headerProps.current = null; vi.clearAllMocks(); });

  it('não-membro não vê busca nem adicionar membros, e não recebe silenciar', () => {
    renderPanel('dep-suporte');
    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar mensagens' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adicionar membros' })).toBeNull();
    expect(h.headerProps.current?.onToggleSearch).toBeUndefined();
    expect(h.headerProps.current?.onAddMembers).toBeUndefined();
    expect(h.headerProps.current?.onToggleMute).toBeUndefined();
  });

  it('membro continua com busca, adicionar membros e silenciar ligados', () => {
    renderPanel('dep-vendas');
    expect(screen.queryByText('Conteúdo Protegido')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buscar mensagens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar membros' })).toBeInTheDocument();
    expect(typeof h.headerProps.current?.onToggleMute).toBe('function');
  });
});
