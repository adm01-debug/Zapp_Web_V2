import { createRef, forwardRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../../ChatPanel';
import type { Conversation } from '@/types/chat';

const setInputValue = vi.fn();

vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({
    isContactTyping: false,
    typingUsers: [],
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => ({ editMessage: vi.fn() }) }));
vi.mock('@/hooks/chat/useQuickReplies', () => ({ useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }) }));
vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: 'voice-1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));
vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }),
}));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({ useScheduledMessages: () => ({ scheduleMessage: vi.fn() }) }));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: (text: string) => text }),
}));
vi.mock('../../useChatMediaSending', () => ({
  useChatMediaSending: () => ({
    instanceName: 'instance-1', whatsappConnectionId: 'connection-1', initResolve: vi.fn(),
    handleSendSticker: vi.fn(), handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn(),
  }),
}));
vi.mock('../useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '', setInputValue, replyToMessage: null, editingMessage: null,
    isRecordingAudio: false, setIsRecordingAudio: vi.fn(), isSending: false,
    forwardMessage: null, inputRef: createRef<HTMLTextAreaElement>(),
    handleInputChange: vi.fn(), handleKeyDown: vi.fn(), handleSend: vi.fn(),
    handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(), handleCopyMessage: vi.fn(),
    handleInteractiveButtonClick: vi.fn(), handleEditStart: vi.fn(), handleCancelEdit: vi.fn(),
    handleSlashCommand: vi.fn(), handleAudioSend: vi.fn(), handleSendProduct: vi.fn(),
    handleSendInteractiveMessage: vi.fn(), handleForwardToTargets: vi.fn(), handleSendLocation: vi.fn(),
  }),
}));
vi.mock('../../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../ChatPanelHeader', () => ({ ChatPanelHeader: () => <header data-testid="chat-header" /> }));
vi.mock('../ChatAssignedBar', () => ({ ChatAssignedBar: () => null }));
vi.mock('../ChatMessagesArea', () => ({
  ChatMessagesArea: forwardRef(function ChatMessagesAreaMock(_, _ref) {
    return <div data-testid="chat-messages" />;
  }),
}));
vi.mock('../ChatInputArea', () => ({ ChatInputArea: () => <div data-testid="chat-composer" /> }));
vi.mock('../ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../../tabs/TabBanner', () => ({
  TabBanner: ({ action }: { action?: { label: string; onClick: () => void } }) => (
    <aside data-testid="chat-ai-banner">
      {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
    </aside>
  ),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }));

const conversation = {
  id: 'conversation-1',
  contact: { id: 'contact-1', name: 'Contato Teste', phone: '5511999999999' },
  status: 'open',
  unreadCount: 0,
  tags: [],
  priority: 'medium',
  channel: 'whatsapp',
  createdAt: new Date('2026-09-09T10:00:00Z'),
  updatedAt: new Date('2026-09-09T10:00:00Z'),
} as unknown as Conversation;

function renderPanel(extra: Record<string, unknown> = {}) {
  const props = {
    conversation,
    messages: [],
    onSendMessage: vi.fn(),
    ...extra,
  };
  return render(<ChatPanel {...(props as Parameters<typeof ChatPanel>[0])} />);
}

describe('ChatPanel — contrato do painel central', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém header, navegação e composer ao exibir uma aba não-chat', () => {
    renderPanel({
      activeTab: 'crm',
      tabNavigation: <nav data-testid="tab-navigation" />,
      tabContent: <section data-testid="crm-tab-content" />,
    });

    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('tab-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
    expect(screen.getByTestId('crm-tab-content')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-messages')).not.toBeInTheDocument();
  });

  it('expõe a conversa como tabpanel ligado semanticamente à aba Chat', () => {
    renderPanel({ activeTab: 'chat' });

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'conversation-tabpanel-chat');
    expect(panel).toHaveAttribute('aria-labelledby', 'conversation-tab-chat');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
  });

  it('encaminha o CTA do banner para a aba IA sem abrir ferramenta paralela', () => {
    const onSelectAssistantTab = vi.fn();
    renderPanel({ activeTab: 'chat', onSelectAssistantTab });

    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestões' }));

    expect(onSelectAssistantTab).toHaveBeenCalledTimes(1);
  });
});
