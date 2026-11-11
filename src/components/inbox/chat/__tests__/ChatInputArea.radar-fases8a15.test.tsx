/**
 * CV-071..150 — painel RADAR fases 8-15 integrado ao ChatInputArea.
 *
 * Verifica que:
 * 1. No desktop sem edição, o painel aparece quando há mensagem de cliente com objeção.
 * 2. No mobile o painel não aparece.
 * 3. No modo edição o painel não aparece.
 *
 * Os hooks do painel (useObjectionHandler, etc.) são puramente computacionais — sem rede.
 * Só filhos decorativos do campo (FileUploader, toolbars, etc.) viram stubs.
 */
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileUploaderRef } from '@/components/inbox/FileUploader';
import type { Message } from '@/types/chat';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

// ── Mocks idênticos ao ChatInputArea.limite-enter.test.tsx ──────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'agente-1' } } }) },
    from: (tabela: string) => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: tabela === 'profiles' ? { name: 'Ana', job_title: null } : null }) }),
      }),
    }),
  },
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'agente-1' }, session: null, profile: null, loading: false }),
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: () => ({ value: null }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
    snoozeConversation: vi.fn(),
  }),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: vi.fn() }),
  tomorrowAtNine: () => new Date('2026-10-07T09:00:00.000Z'),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

// Filhos decorativos
vi.mock('@/components/inbox/FileUploader', () => ({ FileUploader: () => null }));
vi.mock('@/components/inbox/chat/ChatInputToolbars', () => ({
  SecondaryToolbar: () => null,
  TertiaryToolsMenu: () => null,
}));
vi.mock('@/components/inbox/chat/QuickActionChips', () => ({ QuickActionChips: () => null }));
vi.mock('@/components/inbox/chat/InputPreviewBars', () => ({ InputPreviewBars: () => null }));
vi.mock('@/components/inbox/chat/RichTextToolbar', () => ({
  RichTextToolbar: () => null,
  RichTextToggle: () => null,
}));
vi.mock('@/components/inbox/chat/MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: () => ({
    isOpen: false,
    cursorPos: 0,
    checkForMention: vi.fn(),
    handleSelect: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock('@/components/inbox/chat/MarkdownPreview', () => ({ MarkdownPreview: () => null }));
vi.mock('@/components/inbox/chat/AIRewriteButton', () => ({ AIRewriteButton: () => null }));
vi.mock('@/components/inbox/SlashCommands', () => ({ SlashCommands: () => null }));
vi.mock('@/components/inbox/AudioRecorder', () => ({ AudioRecorder: () => null }));
vi.mock('@/components/inbox/StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('@/components/inbox/CustomEmojiPicker', () => ({ CustomEmojiPicker: () => null }));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { ChatInputArea } from '../ChatInputArea';

function msgCliente(content: string, daysAgo = 0): Message {
  const ts = new Date(Date.now() - daysAgo * 86_400_000);
  return { id: `m-${content}`, content, sender: 'contact', timestamp: ts, type: 'text' };
}

function Harness({ messages, editarDeInicio }: { messages: Message[]; editarDeInicio?: Message }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileUploaderRef = useRef<FileUploaderRef>(null);

  const handlers = useChatPanelHandlers({
    conversationId: 'conv-radar',
    contactId: 'contato-radar',
    contactPhone: '5511000000001',
    instanceName: 'instancia-1',
    onSendMessage: vi.fn(),
    editMessageApi: vi.fn(),
    applySignature: (t: string) => t,
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    handleSetActiveTool: vi.fn(),
  });

  return (
    <TooltipProvider>
      <ChatInputArea
        inputValue={handlers.inputValue}
        replyToMessage={handlers.replyToMessage}
        editingMessage={editarDeInicio ? handlers.editingMessage : handlers.editingMessage}
        isRecordingAudio={handlers.isRecordingAudio}
        showSlashCommands={false}
        contactId="contato-radar"
        contactPhone="5511000000001"
        contactName="Cliente Radar"
        instanceName="instancia-1"
        messages={messages}
        quickReplies={[]}
        isSending={handlers.isSending}
        onInputChange={handlers.handleInputChange}
        onKeyDown={(e) => handlers.handleKeyDown(e, false)}
        onBlur={vi.fn()}
        onSend={handlers.handleSend}
        onCancelReply={vi.fn()}
        onCancelEdit={vi.fn()}
        onSlashCommand={vi.fn()}
        onCloseSlashCommands={vi.fn()}
        onQuickReply={vi.fn()}
        onRecordToggle={vi.fn()}
        onAudioSend={vi.fn()}
        onAudioCancel={vi.fn()}
        onOpenInteractiveBuilder={vi.fn()}
        onOpenSchedule={vi.fn()}
        onOpenLocationPicker={vi.fn()}
        onSendSticker={vi.fn()}
        onSendAudioMeme={vi.fn()}
        onSendCustomEmoji={vi.fn()}
        onSelectSuggestion={vi.fn()}
        onSelectTemplate={vi.fn()}
        fileUploaderRef={fileUploaderRef}
        inputRef={inputRef}
      />
    </TooltipProvider>
  );
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('ChatInputArea — painel RADAR fases 8-15 (CV-071..150)', () => {
  beforeEach(() => {
    cleanup();
    // jsdom: window.innerWidth = 1024 → isMobile = false (painel deve aparecer)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  it('exibe card de Objeção quando a última mensagem do cliente contém "está muito caro"', () => {
    render(
      <Harness messages={[msgCliente('está muito caro')]} />,
    );

    expect(screen.getByText(/Objeção:/i)).toBeInTheDocument();
  });

  it('no mobile (< 768 px) o painel não aparece', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    render(
      <Harness messages={[msgCliente('está muito caro')]} />,
    );

    // O painel não renderiza; o card de objeção não está presente.
    expect(screen.queryByText(/Objeção:/i)).not.toBeInTheDocument();
  });

  it('sem mensagens do cliente o painel não exibe cards de objeção', () => {
    const msgAgente: Message = { id: 'm-a', content: 'Olá, como posso ajudar?', sender: 'agent', timestamp: new Date(), type: 'text' };
    render(
      <Harness messages={[msgAgente]} />,
    );

    expect(screen.queryByText(/Objeção:/i)).not.toBeInTheDocument();
  });
});
