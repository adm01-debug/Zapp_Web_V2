/**
 * U7 (paridade V3→V2, doc 11) — drag&drop de arquivos no ChatPanel.
 *
 * A V2 nao tinha teste do caminho de arrastar-e-soltar (na V3 eram 9 casos). O contrato
 * que este arquivo pina, pelo render real do ChatPanel com os componentes visuais mockados:
 *   - `dragEnter` com `dataTransfer.types` contendo 'Files' liga o overlay;
 *   - `dragEnter` sem 'Files' (ex.: arrastar texto) NAO liga o overlay;
 *   - o contador de profundidade (dragCounterRef) so desliga no `dragLeave` que zera
 *     (entrar em filho e sair dele nao apaga o overlay);
 *   - `dragLeave`/`dragOver`/`drop` chamam preventDefault;
 *   - `drop` zera o contador, desliga o overlay e entrega os arquivos ao FileUploader
 *     (`handleExternalFiles`), sem chamar nada quando nao ha arquivo.
 */
import { act, createEvent, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  handleExternalFiles: vi.fn(),
  dragOverlay: { current: null as null | boolean },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn() }) },
    from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

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

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

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

// Componentes visuais/lazy — todos inocuos. ChatDragOverlay e ChatInputArea sao os unicos
// que importam aqui: o overlay captura `isDraggingOver`; o input recebe `fileUploaderRef`,
// e a gente o preenche para observar `handleExternalFiles`.
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({
  ChatDragOverlay: (props: { isDraggingOver: boolean }) => {
    mocks.dragOverlay.current = props.isDraggingOver;
    return null;
  },
}));
vi.mock('../chat/ChatInputArea', () => ({
  ChatInputArea: (props: { fileUploaderRef?: { current: unknown } }) => {
    if (props.fileUploaderRef) {
      props.fileUploaderRef.current = { handleExternalFiles: mocks.handleExternalFiles };
    }
    return null;
  },
}));

vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';

const conversation = {
  id: 'conv-1',
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
} as unknown as Conversation;

function dragEvent(types: string[], files: File[] = []) {
  return { dataTransfer: { types, files } };
}

function renderPanel() {
  return render(
    <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dragOverlay.current = null;
});

describe('ChatPanel — drag&drop de arquivos (U7)', () => {
  it('dragEnter com Files liga o overlay; dragLeave que zera o contador desliga', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;

    act(() => { fireEvent.dragEnter(root, dragEvent(['Files'])); });
    expect(mocks.dragOverlay.current).toBe(true);

    act(() => { fireEvent.dragLeave(root, dragEvent(['Files'])); });
    expect(mocks.dragOverlay.current).toBe(false);
  });

  it('dragEnter sem Files (ex.: texto) nao liga o overlay', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;

    act(() => { fireEvent.dragEnter(root, dragEvent(['text/plain'])); });
    expect(mocks.dragOverlay.current).toBe(false);
  });

  it('mantem o overlay enquanto o ponteiro passa por um filho (contador de profundidade)', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;

    act(() => { fireEvent.dragEnter(root, dragEvent(['Files'])); });
    act(() => { fireEvent.dragEnter(root, dragEvent(['Files'])); }); // entrada aninhada
    expect(mocks.dragOverlay.current).toBe(true);

    act(() => { fireEvent.dragLeave(root, dragEvent(['Files'])); }); // saiu so do filho
    expect(mocks.dragOverlay.current).toBe(true);

    act(() => { fireEvent.dragLeave(root, dragEvent(['Files'])); });
    expect(mocks.dragOverlay.current).toBe(false);
  });

  it('preventDefault em dragLeave, dragOver e drop (nao deixa o navegador abrir o arquivo)', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;

    const leaveEv = createEvent.dragLeave(root, { cancelable: true });
    fireEvent(root, leaveEv);
    expect(leaveEv.defaultPrevented).toBe(true);

    const overEv = createEvent.dragOver(root, { cancelable: true });
    fireEvent(root, overEv);
    expect(overEv.defaultPrevented).toBe(true);

    const dropEv = createEvent.drop(root, { cancelable: true, dataTransfer: { types: ['Files'], files: [] } });
    fireEvent(root, dropEv);
    expect(dropEv.defaultPrevented).toBe(true);
  });

  it('drop desliga o overlay e entrega os arquivos ao FileUploader', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;
    const file = new File(['x'], 'foto.png', { type: 'image/png' });

    act(() => { fireEvent.dragEnter(root, dragEvent(['Files'])); });
    expect(mocks.dragOverlay.current).toBe(true);

    act(() => { fireEvent.drop(root, dragEvent(['Files'], [file])); });

    expect(mocks.dragOverlay.current).toBe(false);
    expect(mocks.handleExternalFiles).toHaveBeenCalledTimes(1);
    expect(mocks.handleExternalFiles.mock.calls[0][0]).toEqual([file]);
  });

  it('drop sem arquivo nao chama handleExternalFiles', () => {
    const { container } = renderPanel();
    const root = container.firstChild as HTMLElement;

    act(() => { fireEvent.drop(root, dragEvent(['text/plain'], [])); });
    expect(mocks.handleExternalFiles).not.toHaveBeenCalled();
  });
});
