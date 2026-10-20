/**
 * R2-INB-026 (refazer 2) — o caminho REAL do `ChatPanel` precisa anunciar QUEM está
 * digitando: a identidade e o nome do agente logado.
 *
 * Defeito (código anterior a este cartão): o painel chamava `useTypingPresence` com
 * `currentUserId: 'agent'` e `currentUserName: conversation.assignedTo?.name`. Com
 * isso o nome exibido era o do agente ATRIBUÍDO à conversa — normalmente quem está
 * olhando a tela — e a outra aba do próprio agente entrava como colega digitando.
 *
 * O teste monta o caminho real `ChatPanel -> useTypingPresence -> ChatMessagesArea ->
 * TypingIndicator` (só as dependências de rede/UI ao redor viram fachadas) e observa:
 *   - a chave de presença e o payload que o painel publica (identidade real);
 *   - o indicador renderizado quando o agente B digita, com o nome de B;
 *   - o indicador ausente quando quem "digita" é a outra aba do próprio agente A;
 *   - e a guarda de regressão do contato (usuário final), que vem por broadcast.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Conversation, Message } from '@/types/chat';

type PresenceEntry = { oderId?: string; name?: string; isTyping?: boolean; lastTyped?: string };
type PresenceStateMap = Record<string, PresenceEntry[]>;
interface ChannelOptions { config: { presence: { key: string } } }

interface FakeChannel {
  name: string;
  opts: ChannelOptions;
  presenceState: () => PresenceStateMap;
  on: (type: string, filter: { event: string }, cb: (arg: unknown) => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  track: (payload: unknown) => Promise<string>;
  untrack: () => Promise<string>;
  unsubscribe: () => void;
  emitSync: () => void;
  emitBroadcast: (event: string, payload: unknown) => void;
}

type SessionUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };

const mocks = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  tracked: [] as { channel: string; payload: Record<string, unknown> }[],
  /** usuário devolvido por `supabase.auth.getSession()` (identidade do agente logado) */
  sessionUser: null as SessionUser | null,
  /** linha de `profiles` usada como rótulo do agente logado */
  profileName: null as string | null,
  /** props recebidas por `useChatPanelHandlers` — dá acesso ao `handleTypingStart` real */
  handlerArgs: { current: null as null | Record<string, unknown> },
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = (name: string, opts: ChannelOptions): FakeChannel => {
    const handlers: Record<string, (arg: unknown) => void> = {};
    const fake: FakeChannel = {
      name,
      opts,
      presenceState: () => ({}),
      on: (type, filter, cb) => { handlers[`${type}:${filter.event}`] = cb; return fake; },
      subscribe: (cb) => { cb?.('SUBSCRIBED'); return fake; },
      track: async (payload) => {
        mocks.tracked.push({ channel: name, payload: payload as Record<string, unknown> });
        return 'ok';
      },
      untrack: async () => 'ok',
      unsubscribe: () => {},
      /** dispara o handler de `presence:sync` como o provedor faz */
      emitSync: () => { handlers['presence:sync']?.({}); },
      emitBroadcast: (event, payload) => { handlers[`broadcast:${event}`]?.({ payload }); },
    };
    mocks.channels.push(fake);
    return fake;
  };

  return {
    supabase: {
      channel,
      removeChannel: vi.fn(),
      auth: {
        getSession: async () => ({
          data: { session: mocks.sessionUser ? { user: mocks.sessionUser } : null },
          error: null,
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mocks.profileName ? { name: mocks.profileName } : null, error: null }),
          }),
        }),
      }),
      storage: {
        from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
      },
    },
  };
});

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---- dependências internas do ChatPanel (precedente: ChatPanel.scheduled-media) ----
vi.mock('../useChatMediaSending', () => ({
  useChatMediaSending: () => ({
    instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(),
    handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn(),
  }),
}));
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: (args: Record<string, unknown>) => {
    mocks.handlerArgs.current = args;
    return {
      inputValue: '', inputRef: { current: null }, isSending: false, isRecordingAudio: false,
      replyToMessage: null, editingMessage: null, forwardMessage: null,
      setInputValue: vi.fn(), handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(),
      handleCopyMessage: vi.fn(), handleInteractiveButtonClick: vi.fn(), handleEditStart: vi.fn(),
      handleInputChange: vi.fn(), handleKeyDown: vi.fn(), handleCancelEdit: vi.fn(),
      handleSlashCommand: vi.fn(), handleAudioSend: vi.fn(), handleSend: vi.fn(),
      handleSendInteractiveMessage: vi.fn(), handleForwardToTargets: vi.fn(), handleSendLocation: vi.fn(),
    };
  },
}));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => ({ editMessage: vi.fn() }) }));
vi.mock('@/hooks/chat/useQuickReplies', () => ({ useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }) }));
vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: '', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));
vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: vi.fn() }),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

// ---- vizinhos da ChatMessagesArea (ela fica REAL, para provar a renderização) ----
vi.mock('@/components/inbox/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid="bubble" data-message-id={message.id}>{message.content}</div>
  ),
}));
vi.mock('@/components/inbox/TypingIndicator', () => ({
  TypingIndicator: ({ isVisible, userName }: { isVisible?: boolean; userName?: string }) =>
    isVisible ? <div data-testid="typing-indicator">{userName} está digitando</div> : null,
}));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined) },
}));

import { ChatPanel } from '../ChatPanel';

/** Quem está logado nesta aba. */
const AGENT_ANA = { id: 'user-ana', name: 'Ana Souza' };
/** Colega digitando na MESMA conversa. */
const AGENT_BRUNO = { id: 'user-bruno', name: 'Bruno Lima' };
/** Agente ATRIBUÍDO à conversa — é quem estava sendo exibido por engano. */
const ASSIGNED = { id: 'user-carlos', name: 'Carlos Andrade' };

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+5511987654321', avatar: '' },
  assignedTo: ASSIGNED,
  sentiment: null,
  messages: [],
} as unknown as Conversation;

/** Canal de presença desta aba, já com a identidade real resolvida. */
async function canalDoAgenteLogado(): Promise<FakeChannel> {
  await waitFor(() => {
    expect(
      mocks.channels.some((c) => c.opts.config.presence.key.startsWith(`${AGENT_ANA.id}#`)),
    ).toBe(true);
  });
  return mocks.channels
    .filter((c) => c.opts.config.presence.key.startsWith(`${AGENT_ANA.id}#`))
    .slice(-1)[0];
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.length = 0;
  mocks.tracked.length = 0;
  mocks.handlerArgs.current = null;
  mocks.sessionUser = { id: AGENT_ANA.id, email: 'ana@promobrindes.com.br', user_metadata: { name: 'nome-dos-metadados' } };
  mocks.profileName = AGENT_ANA.name;
});

describe('ChatPanel — presença de digitação entre agentes (R2-INB-026)', () => {
  it('publica a presença com a identidade REAL do agente logado (nunca o literal "agent" nem o agente atribuído)', async () => {
    await act(async () => { renderPanel(); });

    const canal = await canalDoAgenteLogado();
    expect(canal.name).toBe('typing:conv-1');
    expect(canal.opts.config.presence.key).toContain(AGENT_ANA.id);
    expect(canal.opts.config.presence.key).not.toBe('agent');
    expect(canal.opts.config.presence.key).not.toContain(ASSIGNED.id);

    // O payload que este painel publica quando o agente digita também leva a
    // identidade real e o nome do perfil — não o nome do agente atribuído.
    const handleTypingStart = mocks.handlerArgs.current?.handleTypingStart as () => void;
    await act(async () => { handleTypingStart(); });

    expect(mocks.tracked).toHaveLength(1);
    expect(mocks.tracked[0].channel).toBe('typing:conv-1');
    expect(mocks.tracked[0].payload).toMatchObject({
      oderId: AGENT_ANA.id,
      name: AGENT_ANA.name,
      isTyping: true,
    });
    expect(mocks.tracked[0].payload.name).not.toBe(ASSIGNED.name);
  });

  it('agente B digitando aparece para o agente A com o nome de B', async () => {
    await act(async () => { renderPanel(); });
    const canal = await canalDoAgenteLogado();

    canal.presenceState = () => ({
      [`${AGENT_BRUNO.id}#aba-do-bruno`]: [
        { oderId: AGENT_BRUNO.id, name: AGENT_BRUNO.name, isTyping: true, lastTyped: '2026-10-06T18:00:00.000Z' },
      ],
    });
    act(() => { canal.emitSync(); });

    const indicador = await screen.findByTestId('typing-indicator');
    expect(indicador).toHaveTextContent(`${AGENT_BRUNO.name} está digitando`);
    // O nome do agente atribuído (quem está olhando a tela) e o do contato não entram.
    expect(indicador).not.toHaveTextContent(ASSIGNED.name);
    expect(indicador).not.toHaveTextContent('Maria Silva');
  });

  it('a outra aba do PRÓPRIO agente A não vira colega digitando', async () => {
    await act(async () => { renderPanel(); });
    const canal = await canalDoAgenteLogado();

    canal.presenceState = () => ({
      [`${AGENT_ANA.id}#aba-2`]: [
        { oderId: AGENT_ANA.id, name: AGENT_ANA.name, isTyping: true },
      ],
    });
    act(() => { canal.emitSync(); });

    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });

  it('sem sessão o painel não anuncia colega (não dá para separar a própria aba de um colega)', async () => {
    mocks.sessionUser = null;
    await act(async () => { renderPanel(); });

    const canal = mocks.channels.slice(-1)[0];
    canal.presenceState = () => ({
      [`${AGENT_BRUNO.id}#aba-do-bruno`]: [
        { oderId: AGENT_BRUNO.id, name: AGENT_BRUNO.name, isTyping: true },
      ],
    });
    act(() => { canal.emitSync(); });

    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });

  it('guarda de regressão: o contato (broadcast) continua anunciado com o nome do contato', async () => {
    await act(async () => { renderPanel(); });
    const canal = await canalDoAgenteLogado();

    act(() => { canal.emitBroadcast('contact_typing', { isTyping: true }); });

    const indicador = await screen.findByTestId('typing-indicator');
    expect(indicador).toHaveTextContent('Maria Silva está digitando');
  });
});
