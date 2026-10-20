/**
 * R2-INB-023 (prova observável) — pelo caminho REAL
 * `ChatPopup -> ChatPanel -> ChatMessagesArea -> MessageBubble`, o balão tem de
 * renderizar o que o registro do popup promete:
 *   - `is_deleted`  → placeholder "Você apagou esta mensagem" (não o balão ativo);
 *   - `isEdited`    → marcador "editada";
 *   - `link_preview`→ cartão de preview do link;
 *   - `location`    → o balão de localização.
 * Antes da correção o popup remontava a mensagem com um subconjunto de campos e
 * todos esses ramos caíam para "sem dado": nada disso aparecia.
 *
 * Só o balão é REAL aqui; seus filhos pesados (mapa, player, toolbar) entram
 * como espiões. A medida de layout entra porque o jsdom não dá altura ao
 * contêiner de rolagem e o virtualizador não renderizaria linhas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const ALTURA_JANELA = 600;
const ALTURA_ESTIMADA = 100;
const CONTACT_ID = 'contato-popup-1';

const mocks = vi.hoisted(() => ({
  messages: {} as Record<string, unknown>,
  contactId: '' as string,
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => mocks.messages,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ contactId: mocks.contactId }) };
});

const CONTACT_ROW = {
  id: CONTACT_ID, name: 'Maria Silva', phone: '+5511****9999', avatar_url: null, email: null,
  tags: [], created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z',
  ai_priority: null, status: 'open', last_message: 'oi', unread_count: 0, assigned_to: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CONTACT_ROW, error: null }) }) }),
    }),
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---- dependências internas do ChatPanel (mesmo conjunto do ChatPopup.pagination) ----
vi.mock('@/components/inbox/useChatMediaSending', () => ({
  useChatMediaSending: () => ({
    instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(),
    handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn(),
  }),
}));
vi.mock('@/components/inbox/CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('@/components/inbox/chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('@/components/inbox/chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('@/components/inbox/chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('@/components/inbox/chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('@/components/inbox/chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('@/components/inbox/chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('@/components/inbox/chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('@/components/inbox/chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('@/components/inbox/chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '', inputRef: { current: null }, isSending: false, isRecordingAudio: false,
    replyToMessage: null, editingMessage: null, forwardMessage: null,
    setInputValue: vi.fn(), handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(),
    handleCopyMessage: vi.fn(), handleInteractiveButtonClick: vi.fn(), handleEditStart: vi.fn(),
    handleInputChange: vi.fn(), handleKeyDown: vi.fn(), handleCancelEdit: vi.fn(),
    handleSlashCommand: vi.fn(), handleAudioSend: vi.fn(), handleSend: vi.fn(),
    handleSendInteractiveMessage: vi.fn(), handleForwardToTargets: vi.fn(), handleSendLocation: vi.fn(),
  }),
}));
vi.mock('@/components/inbox/WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('@/components/inbox/NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('@/components/inbox/TransferDialog', () => ({ default: () => null }));
vi.mock('@/components/inbox/AIConversationAssistant', () => ({ default: () => null }));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({ default: () => null }));
vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({ isContactTyping: false, typingUsers: [], handleTypingStart: vi.fn(), handleTypingStop: vi.fn() }),
}));
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
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: vi.fn() }),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

// ---- filhas do ChatMessagesArea ----
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined) },
}));

// ---- o BALÃO é REAL; só os filhos pesados viram espiões ----
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { name: 'Ana', avatar_url: null } }) }));
vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/inbox/MessageReactions', () => ({
  // O bubble real passa `external_id` (ID remoto) para estas ações: renderizamos
  // o valor recebido para provar que ele sobreviveu ao caminho do popup.
  MessageReactions: ({ externalId }: { externalId?: string }) => (
    <div data-testid="message-reactions" data-external-id={externalId ?? ''} />
  ),
  QuickReactionBar: ({ externalId }: { externalId?: string }) => (
    <div data-testid="quick-reactions" data-external-id={externalId ?? ''} />
  ),
}));
vi.mock('@/components/inbox/chat/MessageHoverToolbar', () => ({ MessageHoverToolbar: () => null }));
vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/MediaPreview', () => ({ DocumentPreview: () => null, VideoPreview: () => null }));
vi.mock('@/components/inbox/AudioMessagePlayer', () => ({ AudioMessagePlayer: () => null }));
vi.mock('@/components/inbox/InteractiveMessage', () => ({
  InteractiveMessageDisplay: () => null, ButtonResponseBadge: () => null,
}));
vi.mock('@/components/inbox/ReplyQuote', () => ({ QuotedMessage: () => null }));
vi.mock('@/components/inbox/TextToSpeechButton', () => ({ TextToSpeechButton: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));
vi.mock('@/components/inbox/chat/HighlightedText', () => ({ HighlightedText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({
  LinkPreviewCard: ({ preview }: { preview: { url?: string } }) => (
    <div data-testid="link-preview">{preview.url}</div>
  ),
}));
vi.mock('@/components/inbox/LocationMessage', () => ({
  LocationMessageDisplay: ({ location }: { location: { address?: string } }) => (
    <div data-testid="location">{location.address}</div>
  ),
}));

import ChatPopup from '../ChatPopup';

/** Apagada: o balão precisa do placeholder, não do balão ativo. */
const MSG_APAGADA = {
  id: 'msg-apagada',
  content: 'não deve sumir sem placeholder',
  sender: 'agent' as const,
  timestamp: new Date('2026-09-01T10:05:00Z'),
  created_at: '2026-09-01T10:05:00Z',
  updated_at: '2026-09-01T10:06:00Z',
  type: 'text' as const,
  message_type: 'text',
  media_url: null,
  status: 'sent',
  is_read: true,
  is_deleted: true,
  isEdited: false,
  external_id: 'wamid.APAGADA',
  link_preview: null,
};

/** Editada + preview de link: dois campos que o popup descartava. */
const MSG_EDITADA = {
  id: 'msg-editada',
  content: 'texto com link',
  sender: 'agent' as const,
  timestamp: new Date('2026-09-01T10:07:00Z'),
  created_at: '2026-09-01T10:07:00Z',
  updated_at: '2026-09-01T10:08:00Z',
  type: 'text' as const,
  message_type: 'text',
  media_url: null,
  status: 'sent',
  is_read: true,
  is_deleted: false,
  isEdited: true,
  external_id: 'wamid.EDITADA',
  link_preview: { url: 'https://exemplo.com/materia', title: 'Matéria' },
};

/** Localização: o balão só renderiza com `type === 'location'` e `location`. */
const MSG_LOCALIZACAO = {
  id: 'msg-localizacao',
  content: '{"latitude":-23.5,"longitude":-46.6}',
  sender: 'contact' as const,
  timestamp: new Date('2026-09-01T10:10:00Z'),
  created_at: '2026-09-01T10:10:00Z',
  updated_at: '2026-09-01T10:10:00Z',
  type: 'location' as const,
  message_type: 'location',
  media_url: null,
  status: 'delivered',
  is_read: false,
  is_deleted: false,
  isEdited: false,
  external_id: 'wamid.LOC',
  location: { latitude: -23.5, longitude: -46.6, address: 'Av. Paulista, 100' },
};

function useMessagesState(overrides: Record<string, unknown> = {}) {
  return {
    messages: [MSG_APAGADA, MSG_EDITADA, MSG_LOCALIZACAO],
    loading: false,
    error: null,
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(async () => {}),
    ...overrides,
  };
}

function buildUi(): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ChatPopup />
    </QueryClientProvider>
  );
}

function medirLayout() {
  const proto = HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'log' ? ALTURA_JANELA : ALTURA_ESTIMADA;
    },
  });
  return {
    mockRestore() {
      if (original) Object.defineProperty(proto, 'offsetHeight', original);
      else delete (proto as unknown as Record<string, unknown>).offsetHeight;
    },
  };
}

let medir: { mockRestore: () => void };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contactId = CONTACT_ID;
  mocks.messages = useMessagesState();
  medir = medirLayout();
});

afterEach(() => {
  medir.mockRestore();
});

describe('ChatPopup — o balão real renderiza os campos do Message (R2-INB-023)', () => {
  it('mensagem apagada rende o placeholder, não o balão ativo', async () => {
    render(buildUi());

    expect(await screen.findByText('Você apagou esta mensagem')).toBeInTheDocument();
  });

  it('mensagem editada mostra o marcador "editada"', async () => {
    render(buildUi());

    await screen.findByText('texto com link');
    expect(screen.getByText('editada')).toBeInTheDocument();
  });

  it('link_preview chega ao cartão de preview do link', async () => {
    render(buildUi());

    const preview = await screen.findByTestId('link-preview');
    expect(preview).toHaveTextContent('https://exemplo.com/materia');
  });

  it('mensagem de localização rende o balão de localização com o endereço', async () => {
    render(buildUi());

    const local = await screen.findByTestId('location');
    expect(local).toHaveTextContent('Av. Paulista, 100');
  });

  it('external_id (ID remoto) chega às ações da mensagem', async () => {
    render(buildUi());

    await screen.findAllByTestId('message-reactions');
    const idsRecebidos = Array.from(
      document.querySelectorAll<HTMLElement>('[data-external-id]'),
    ).map((el) => el.dataset.externalId);

    // Cada mensagem entrega o seu ID remoto ao balão (reações/edição/exclusão).
    expect(idsRecebidos).toContain('wamid.APAGADA');
    expect(idsRecebidos).toContain('wamid.EDITADA');
    expect(idsRecebidos).toContain('wamid.LOC');
  });
});
