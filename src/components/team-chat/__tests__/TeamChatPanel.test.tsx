import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * F79 — canal de departamento para quem está FORA do departamento: a tela
 * mostrava só o aviso "Conteúdo Protegido" e não havia caminho de entrada; o
 * convite por código (RPC `accept_department_invite`, via
 * `useAcceptDepartmentInvite`) era inalcançável pela interface.
 *
 * O teste renderiza o Panel REAL e mocka o módulo de hooks que ele importa
 * ('@/hooks/team-chat/useDepartmentManagement') — mesmo caminho do import de
 * produção — para provar que a submissão passa pela função do hook.
 */
const h = vi.hoisted(() => {
  const acceptMutate = vi.fn();

  const panel = {
    profile: { id: 'user-1', department_id: 'dep-outro' },
    messages: [],
    filteredMessages: [],
    isLoading: false,
    isMuted: false,
    canTransfer: false,
    isFetchingOlder: false,
    hasOlderMessages: false,
    fetchOlderMessages: vi.fn(),
    showScrollDown: false,
    text: '', setText: vi.fn(), replyTo: null, setReplyTo: vi.fn(),
    editingId: null, editText: '', setEditText: vi.fn(),
    showSearch: false, setShowSearch: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
    showAddMembers: false, setShowAddMembers: vi.fn(),
    isRecordingAudio: false, setIsRecordingAudio: vi.fn(),
    scrollRef: { current: null },
    searchInputRef: { current: null },
    isNearBottomRef: { current: true },
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

  const accept = {
    mutate: acceptMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null as unknown,
  };

  return { acceptMutate, panel, accept };
});

vi.mock('../useTeamChatPanel', () => ({
  useTeamChatPanel: () => h.panel,
}));

vi.mock('../TeamChatHeader', () => ({ TeamChatHeader: () => <div data-testid="header" /> }));
vi.mock('../TeamChatInputArea', () => ({ TeamChatInputArea: () => <div data-testid="input-area" /> }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));

vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useAcceptDepartmentInvite: () => h.accept,
}));

const departmentConversation = {
  id: 'conv-dep',
  type: 'department',
  department_id: 'dep-1',
} as unknown as TeamConversation;

function renderPanel() {
  return render(<TeamChatPanel conversation={departmentConversation} onBack={() => {}} />);
}

describe('TeamChatPanel — entrada por código no departamento (F79)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.accept.isPending = false;
    h.accept.isSuccess = false;
    h.accept.isError = false;
    h.accept.error = null;
    h.panel.profile = { id: 'user-1', department_id: 'dep-outro' };
    h.panel.canTransfer = false;
  });

  it('oferece a entrada por código para quem está fora do departamento, com o conteúdo bloqueado', () => {
    renderPanel();
    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
    expect(screen.getByLabelText('Código do convite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/ })).toBeInTheDocument();
    // F79: a ação tem o nome do plano ("Entrar via Código"), não só "Entrar".
    expect(screen.getByRole('button', { name: 'Entrar via código' })).toBeInTheDocument();
    // O conteúdo continua fechado para quem não é membro.
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('admin/supervisor abre o canal do departamento sem pedir o código (F80)', () => {
    h.panel.canTransfer = true;
    renderPanel();
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código do convite')).toBeNull();
  });

  it('submete o código do convite pela função do hook do departamento', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: ' AB12CD34 ' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(h.acceptMutate).toHaveBeenCalledTimes(1);
    expect(h.acceptMutate).toHaveBeenCalledWith('AB12CD34');
  });

  it('não submete código vazio', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(h.acceptMutate).not.toHaveBeenCalled();
  });

  it('mostra o motivo tipado quando a RPC recusa o código', () => {
    h.accept.isError = true;
    h.accept.error = new Error('invite_exhausted');
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Este convite já atingiu o limite de usos.');
  });

  it('mostra a confirmação depois de o código ser aceito', () => {
    h.accept.isSuccess = true;
    renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent('Código aceito. Você entrou no departamento.');
    expect(screen.queryByLabelText('Código do convite')).toBeNull();
  });

  it('não pede código para quem já é do departamento (não regride o canal liberado)', () => {
    h.panel.profile = { id: 'user-1', department_id: 'dep-1' };
    renderPanel();
    expect(screen.queryByLabelText('Código do convite')).toBeNull();
    expect(screen.getByRole('log')).toBeInTheDocument();
  });
});
