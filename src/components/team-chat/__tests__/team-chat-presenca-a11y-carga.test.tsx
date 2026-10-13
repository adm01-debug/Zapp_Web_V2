/**
 * F85/F86/N-182/E86/E87 — presença e digitação (canais privados do PD-69),
 * estados de carregamento/erro, busca por última mensagem, atalhos e
 * acessibilidade do chat de equipe.
 *
 * Os testes usam o componente REAL: Header, Lista e View são renderizados de
 * verdade. No Panel só a fonte de dados (`useTeamChatPanel`) e as folhas (item de
 * mensagem/área de escrita) são substituídas — a digitação é provada ponta a
 * ponta pelo canal de broadcast real (`useTeamTyping`), que envia/escuta pelo
 * stub do client do Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamChatHeader } from '../TeamChatHeader';
import { TeamConversationList } from '../TeamConversationList';
import { TeamChatView } from '../TeamChatView';
import { TeamChatPanel } from '../TeamChatPanel';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';

const h = vi.hoisted(() => {
  const names: string[] = [];
  const handlers: Record<string, Array<(payload: unknown) => void>> = { broadcast: [], presence: [] };
  const sent: Array<{ event: string; payload: unknown }> = [];

  const channel = (name: string) => {
    names.push(name);
    const ch: Record<string, unknown> = {};
    ch.on = (type: string, _filter: unknown, cb: (payload: unknown) => void) => {
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(cb);
      return ch;
    };
    ch.subscribe = (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return ch; };
    ch.track = () => Promise.resolve();
    ch.send = (args: { event: string; payload: unknown }) => { sent.push({ event: args.event, payload: args.payload }); return Promise.resolve(); };
    ch.presenceState = () => ({});
    return ch;
  };

  const message = (id: string, senderId: string, content: string): TeamMessage => ({
    id, conversation_id: 'conv-a', sender_id: senderId, content, message_type: 'text',
    media_url: null, media_type: null, reply_to_id: null, is_edited: false,
    status: 'sent', created_at: '2026-10-13T10:00:00.000Z', updated_at: '2026-10-13T10:00:00.000Z',
    sender: { id: senderId, name: senderId === 'u1' ? 'Eu' : 'Ana', avatar_url: null },
  });

  const messages = [message('m-1', 'u2', 'oi'), message('m-2', 'u1', 'minha'), message('m-3', 'u2', 'tudo bem?')];

  const panel = {
    profile: { id: 'u1', name: 'Eu' },
    messages,
    filteredMessages: messages,
    isLoading: false,
    isMuted: false,
    isFetchingOlder: false,
    hasOlderMessages: true,
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
    tts: { speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false, currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn() },
    reactions: { aggregate: () => [], toggle: vi.fn() },
  };

  return { names, handlers, sent, channel, panel, messages };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() }, channel: h.channel, removeChannel: vi.fn() },
}));

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [], isLoading: false }),
}));

const q = vi.hoisted(() => ({
  state: { data: [] as TeamConversation[], isLoading: false, isError: false, refetch: vi.fn() },
}));
vi.mock('@/hooks/chat/useTeamChat', () => ({ useTeamConversations: () => q.state }));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({ useActiveTeamChatConversation: () => {} }));

vi.mock('../useTeamChatPanel', () => ({ useTeamChatPanel: () => h.panel }));
vi.mock('../AddMembersDialog', () => ({ AddMembersDialog: () => null }));
vi.mock('../NewConversationDialog', () => ({ NewConversationDialog: () => null }));
vi.mock('../TeamMemberDetails', () => ({ TeamMemberDetails: () => null }));
vi.mock('../TeamMessageItem', () => ({
  TeamMessageItem: ({ msg }: { msg: TeamMessage }) => <div data-testid="msg" data-msg-id={msg.id} />,
}));
vi.mock('../TeamChatInputArea', () => ({
  TeamChatInputArea: ({ setText }: { setText: (text: string) => void }) => (
    <div>
      <button type="button" onClick={() => setText('oi')}>digitar</button>
      <button type="button" onClick={() => setText('')}>limpar</button>
    </div>
  ),
}));

const groupConversation = {
  id: 'conv-a', type: 'group', name: 'Comercial', avatar_url: null, created_by: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  members: [{ id: 'mem-1' }, { id: 'mem-2' }],
} as unknown as TeamConversation;

beforeEach(() => {
  vi.clearAllMocks();
  h.names.length = 0;
  h.sent.length = 0;
  h.handlers.broadcast = [];
  h.handlers.presence = [];
  h.panel.filteredMessages = h.messages;
  h.panel.messages = h.messages;
  h.panel.showScrollDown = false;
  h.panel.isNearBottomRef.current = true;
  q.state.data = [];
  q.state.isLoading = false;
  q.state.isError = false;
});

// ─────────────────────────────── Cabeçalho ───────────────────────────────

describe('F85/F86 — cabeçalho mostra digitação e presença', () => {
  function renderHeader(props: { typingLabel?: string | null; onlineCount?: number } = {}) {
    return render(
      <TooltipProvider>
        <TeamChatHeader
          conversation={groupConversation}
          voiceId="v1"
          speed={1}
          showSearch={false}
          onBack={() => {}}
          onToggleSearch={() => {}}
          onAddMembers={() => {}}
          onVoiceChange={() => {}}
          onSpeedChange={() => {}}
          {...props}
        />
      </TooltipProvider>,
    );
  }

  it('sem ninguém digitando mostra membros e quantos estão online', () => {
    renderHeader({ onlineCount: 2 });
    expect(screen.getByText('2 membros · 2 online')).toBeInTheDocument();
  });

  it('com alguém digitando troca o subtítulo pelo rótulo de digitação', () => {
    renderHeader({ typingLabel: 'Ana está digitando...', onlineCount: 2 });
    expect(screen.getByText('Ana está digitando...')).toBeInTheDocument();
    expect(screen.queryByText('2 membros · 2 online')).not.toBeInTheDocument();
  });
});

// ───────────────────────────── Lista de conversas ─────────────────────────

describe('lista — busca por última mensagem e atalhos (N-182/F83)', () => {
  const convs = [
    { id: 'c1', type: 'group', name: 'Equipe A', members: [], last_message: { content: 'orçamento aprovado', created_at: '2026-10-13T10:00:00Z' } },
    { id: 'c2', type: 'direct', name: 'Bruno', members: [], last_message: { content: 'bom dia', created_at: '2026-10-13T09:00:00Z' } },
  ] as unknown as TeamConversation[];

  function renderList(props: Record<string, unknown> = {}) {
    return render(
      <TeamConversationList conversations={convs} selectedId={null} onSelect={() => {}} {...props} />,
    );
  }

  it('acha a conversa pelo conteúdo da última mensagem', () => {
    renderList();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'orçamento' } });
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
  });

  it('Ctrl+K leva o foco para a busca e Esc limpa o texto', () => {
    renderList();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByPlaceholderText('Buscar...');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'bruno' } });
    expect(screen.queryByText('Equipe A')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
  });

  it('primeiro carregamento mostra esqueleto, sem role list', () => {
    const { container } = renderList({ conversations: [], isLoading: true });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Conversas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conversa')).not.toBeInTheDocument();
  });

  it('erro mostra aviso e botão de tentar novamente', () => {
    const onRetry = vi.fn();
    renderList({ conversations: [], isError: true, onRetry });
    expect(screen.getByText('Não foi possível carregar as conversas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────── View (estados) ────────────────────────────

describe('TeamChatView — carregamento e erro da lista', () => {
  it('esqueleto na coluna e na área de mensagens no primeiro carregamento', () => {
    q.state.isLoading = true;
    const { container } = render(<TeamChatView />);
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(2);
  });

  it('erro mostra o aviso e o botão tenta buscar de novo', () => {
    q.state.isError = true;
    render(<TeamChatView />);
    expect(screen.getAllByText('Não foi possível carregar as conversas.')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Tentar novamente' })[0]);
    expect(q.state.refetch).toHaveBeenCalledTimes(1);
  });
});

// ──────────────── Painel: digitação, presença, a11y, janela ────────────────

describe('TeamChatPanel — digitação/presença pelos canais privados (PD-69)', () => {
  function renderPanel() {
    return render(
      <TooltipProvider>
        <TeamChatPanel conversation={groupConversation} onBack={() => {}} />
      </TooltipProvider>,
    );
  }

  it('assina os canais privados da conversa', () => {
    renderPanel();
    expect(h.names).toContain('team-typing-conv-a');
    expect(h.names).toContain('team-presence-conv-a');
  });

  it('evento de digitação do canal aparece no cabeçalho e na região viva', () => {
    renderPanel();
    act(() => {
      h.handlers.broadcast.forEach((cb) => cb({ payload: { userId: 'u2', name: 'Ana', typing: true } }));
    });
    expect(screen.getAllByText('Ana está digitando...').length).toBeGreaterThanOrEqual(2);
    const anuncios = screen.getAllByRole('status').map((el) => el.textContent).join(' | ');
    expect(anuncios).toContain('Ana está digitando...');
  });

  it('digitar envia o aviso pelo canal; limpar avisa que parou', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'digitar' }));
    expect(h.sent).toContainEqual({ event: 'typing', payload: { userId: 'u1', name: 'Eu', typing: true } });
    fireEvent.click(screen.getByRole('button', { name: 'limpar' }));
    expect(h.sent).toContainEqual({ event: 'typing', payload: { userId: 'u1', name: 'Eu', typing: false } });
  });

  it('skip link aponta para a lista de mensagens', () => {
    const { container } = renderPanel();
    const link = screen.getByRole('link', { name: 'Ir para mensagens' });
    expect(link).toHaveAttribute('href', '#team-chat-messages');
    expect(container.querySelector('#team-chat-messages')).not.toBeNull();
  });

  it('longe do fim, o contador avisa quantas mensagens chegaram', () => {
    h.panel.showScrollDown = true;
    h.panel.isNearBottomRef.current = false;
    renderPanel();
    expect(screen.getByText('3 novas mensagens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao final' })).toBeInTheDocument();
  });
});

describe('TeamChatPanel — janela de renderização das mensagens', () => {
  function makeMessages(total: number): TeamMessage[] {
    return Array.from({ length: total }, (_, i) => ({
      id: `m-${i}`, conversation_id: 'conv-a', sender_id: i % 2 === 0 ? 'u2' : 'u1', content: `msg ${i}`,
      message_type: 'text', media_url: null, media_type: null, reply_to_id: null, is_edited: false,
      status: 'sent', created_at: '2026-10-13T10:00:00.000Z', updated_at: '2026-10-13T10:00:00.000Z',
      sender: { id: 'u2', name: 'Ana', avatar_url: null },
    }));
  }

  it('lista longa renderiza só a janela final e amplia a um clique', () => {
    h.panel.filteredMessages = makeMessages(205);
    const { container } = render(
      <TooltipProvider>
        <TeamChatPanel conversation={groupConversation} onBack={() => {}} />
      </TooltipProvider>,
    );
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(200);
    expect(items[0].getAttribute('aria-posinset')).toBe('6');
    expect(items[0].getAttribute('aria-setsize')).toBe('205');
    expect(items[0].getAttribute('data-index')).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar as 5 mensagens anteriores' }));
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(205);
  });
});
