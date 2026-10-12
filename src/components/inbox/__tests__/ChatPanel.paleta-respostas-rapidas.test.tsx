/**
 * UI-08 — a paleta (⌘K) abre o seletor de respostas rápidas do compositor.
 *
 * O comando "Respostas rápidas" da paleta não tem como abrir sozinho o seletor: quem é
 * dono do diálogo é o ChatPanel. Este teste monta o ChatPanel REAL (com o mesmo conjunto
 * de mocks de periféricos do ChatTransferContract.test.tsx) e dispara o MESMO evento
 * global que o comando publica (`open-quick-replies`), observando o seletor real abrir.
 * Espelha o padrão já aceito de `open-transfer-dialog` (ChatPanel.tsx).
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({
    isContactTyping: false,
    typingUsers: [],
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ editMessage: vi.fn() }),
}));

vi.mock('@/hooks/chat/useQuickReplies', () => ({
  useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
    isPlaying: false,
    currentMessageId: null,
    voiceId: '',
    setVoiceId: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }),
}));

vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({
    messages: [],
    isLoading: false,
    scheduleMessage: vi.fn(),
    cancelMessage: vi.fn(),
    isScheduling: false,
  }),
}));

vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({
    signatureEnabled: false,
    agentName: '',
    toggleSignature: vi.fn(),
    applySignature: vi.fn(),
  }),
}));

vi.mock('../useChatMediaSending', () => ({
  useChatMediaSending: () => ({
    instanceName: '',
    initResolve: vi.fn(),
    handleSendSticker: vi.fn(),
    handleSendCustomEmoji: vi.fn(),
    handleSendAudioMeme: vi.fn(),
  }),
}));

vi.mock('@/hooks/ui/useAmbientColor', () => ({
  useAmbientColor: () => ({ className: '', bgTint: undefined }),
}));

vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

vi.mock('../chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '',
    inputRef: { current: null },
    isSending: false,
    isRecordingAudio: false,
    replyToMessage: null,
    editingMessage: null,
    forwardMessage: null,
    setInputValue: vi.fn(),
    handleReplyToMessage: vi.fn(),
    handleForwardMessage: vi.fn(),
    handleCopyMessage: vi.fn(),
    handleInteractiveButtonClick: vi.fn(),
    handleEditStart: vi.fn(),
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleCancelEdit: vi.fn(),
    handleSlashCommand: vi.fn(),
    handleAudioSend: vi.fn(),
    handleSend: vi.fn(),
    handleSendInteractiveMessage: vi.fn(),
    handleForwardToTargets: vi.fn(),
    handleSendLocation: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me-auth-id' } }),
}));
vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], isLoading: false }),
}));
vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false }),
}));

// Componentes visuais/lazy periféricos — inócuos. O seletor de respostas rápidas vira um
// marcador observável em vez de ser escondido atrás de um portal.
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../AIConversationAssistant', () => ({ AIConversationAssistant: () => null }));
vi.mock('../CloseConversationDialog', () => ({ CloseConversationDialog: () => null }));

vi.mock('../chat/ChatQuickRepliesPopover', () => ({
  ChatQuickRepliesPopover: ({ show }: { show?: boolean }) =>
    show ? <div data-testid="seletor-respostas-rapidas" /> : null,
}));

const conversation = {
  id: 'conv-1',
  contact: { id: 'CONTATO-1', name: 'Maria Silva', phone: '+551****9999', avatar: '' },
  assignedTo: { name: 'Agente' },
} as unknown as Conversation;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UI-08 — a paleta (⌘K) abre as respostas rápidas pelo gatilho global', () => {
  it('o evento "open-quick-replies" abre o seletor de respostas rápidas do compositor', async () => {
    render(<ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />);
    expect(screen.queryByTestId('seletor-respostas-rapidas')).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('open-quick-replies'));
    });

    expect(screen.getByTestId('seletor-respostas-rapidas')).toBeInTheDocument();
  });
});
