import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * E83/F79 — "Entrar via Código" no bloqueio "Conteúdo Protegido".
 *
 * Antes deste cartão o canal de departamento bloqueado só dizia "solicite um
 * convite ao administrador": o agente que tinha o código em mãos não tinha onde
 * digitá-lo. O teste trava o wiring da tela: input de código + botão "Entrar" no
 * bloqueio, resgate pela RPC (via `useRedeemDepartmentInvite`) e o
 * `refreshProfile()` que faz `isChannelMember` virar sem reload. Um código curto
 * não dispara a RPC.
 */
const h = vi.hoisted(() => {
  const redeem = {
    isPending: false,
    error: null as Error | null,
    mutateAsync: vi.fn(() => Promise.resolve({ departmentId: 'dep-B' })),
  };
  const panel = {
    // Já logado, mas em OUTRO departamento: é o caso do bloqueio.
    profile: { id: 'u-1', department_id: 'dep-A' },
    messages: [] as unknown[],
    filteredMessages: [] as unknown[],
    isLoading: false,
    isMuted: false,
    showScrollDown: false,
    hasOlderMessages: false,
    isFetchingOlder: false,
    fetchOlderMessages: vi.fn(),
    checkNearBottom: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollRef: { current: null },
    searchInputRef: { current: null },
    isNearBottomRef: { current: true },
    showSearch: false,
    setShowSearch: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    showAddMembers: false,
    setShowAddMembers: vi.fn(),
    text: '',
    setText: vi.fn(),
    replyTo: null,
    setReplyTo: vi.fn(),
    isRecordingAudio: false,
    setIsRecordingAudio: vi.fn(),
    sendMutation: { isPending: false },
    muteMutation: { mutate: vi.fn() },
    reactions: { aggregate: () => [], toggle: vi.fn() },
    tts: {
      speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
      currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
    },
  };
  return { redeem, refreshProfile: vi.fn(() => Promise.resolve()), panel };
});

vi.mock('../useTeamChatPanel', () => ({ useTeamChatPanel: () => h.panel }));
vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useRedeemDepartmentInvite: () => h.redeem,
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ refreshProfile: h.refreshProfile, profile: h.panel.profile }),
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

const conversation = {
  id: 'conv-dept', type: 'department', department_id: 'dep-B', members: [],
} as unknown as TeamConversation;

function renderPanel() {
  return render(<TeamChatPanel conversation={conversation} onBack={() => {}} />);
}

describe('TeamChatPanel — "Entrar via Código" no canal de departamento bloqueado (E83/F79)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.redeem.isPending = false;
    h.redeem.error = null;
    h.redeem.mutateAsync = vi.fn(() => Promise.resolve({ departmentId: 'dep-B' }));
    h.refreshProfile = vi.fn(() => Promise.resolve());
  });

  it('mostra o input de código e o botão Entrar no bloqueio', () => {
    renderPanel();

    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument();
    expect(screen.getByLabelText('Código do convite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('resgata pela RPC com o código em maíusculas e então atualiza o perfil (sem reload)', async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: 'ab12cd34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(h.redeem.mutateAsync).toHaveBeenCalledWith({ code: 'AB12CD34' });
    });
    await waitFor(() => {
      expect(h.refreshProfile).toHaveBeenCalledTimes(1);
    });
  });

  it('não dispara a RPC com código curto', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: 'AB12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(h.redeem.mutateAsync).not.toHaveBeenCalled();
  });

  it('exibe a mensagem de erro tipada devolvida pelo resgate', () => {
    h.redeem.error = new Error('Código inválido ou expirado');
    renderPanel();

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Código inválido ou expirado');
  });
});