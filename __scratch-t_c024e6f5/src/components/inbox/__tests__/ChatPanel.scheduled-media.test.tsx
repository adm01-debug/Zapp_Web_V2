/**
 * R2-DB-022 (C) — anexo agendado deve usar o path canônico `<contact_id>/<id-opaco>-<nome-seguro>`.
 *
 * O produtor de mídia agendada em ChatPanel.tsx (`handleScheduleMessage`) hoje grava o
 * objeto como `scheduled_<timestamp>_<nome>` — sem o primeiro segmento igual ao contact_id,
 * fora do contrato exigido pelo endurecimento do banco (o SELECT autoriza pela pasta do
 * contato). Este teste prova o comportamento observando o upload via supabase mockado:
 * antes da correção, o path NÃO começa pelo contact_id (vermelho); depois, começa.
 *
 * Estratégia: renderizamos o ChatPanel com TODOS os hooks/componentes dependentes mockados e
 * `ChatDialogs` capturando as props, para invocar `onScheduleMessage` diretamente (o mesmo
 * handler que o diálogo de agendamento chama) e observar o upload + a persistência.
 */
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  scheduleMessage: vi.fn(),
  dialogsProps: { current: null as null | Record<string, unknown> },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: () => ({
      update: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    scheduleMessage: mocks.scheduleMessage,
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

// Componentes visuais/lazy — todos inócuos; ChatDialogs captura as props.
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));

vi.mock('../chat/ChatDialogs', () => ({
  ChatDialogs: (props: Record<string, unknown>) => {
    mocks.dialogsProps.current = props;
    return null;
  },
}));

// Lazy imports no topo do ChatPanel.
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';
const ORIGIN = 'https://project.test';

function createFile(name = 'foto do cliente.png', type = 'image/png') {
  return new File(['conteúdo'], name, { type });
}

const conversation = {
  id: 'conv-1',
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
} as unknown as Conversation;

function renderPanel() {
  return render(
    <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />,
  );
}

/** Invoca o handler de agendamento capturado de ChatDialogs. */
async function scheduleAttachment(file: File, scheduledAt = new Date(Date.now() + 3600_000)) {
  const props = mocks.dialogsProps.current as unknown as {
    onScheduleMessage: (message: string, scheduledAt: Date, attachment?: File) => Promise<void>;
  };
  await act(async () => {
    await props.onScheduleMessage('Olá, segue o anexo', scheduledAt, file);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
    remove: mocks.remove,
  });
  mocks.upload.mockResolvedValue({ error: null });
  // getPublicUrl deriva o locator do path de verdade, para provar a correspondência.
  mocks.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `${ORIGIN}/storage/v1/object/public/whatsapp-media/${path}` },
  }));
  mocks.remove.mockResolvedValue({ error: null });
  mocks.scheduleMessage.mockResolvedValue({ id: 'sched-1' });
  mocks.dialogsProps.current = null;
});

describe('ChatPanel — anexo agendado no path canônico do contato', () => {
  it('envia o upload com o primeiro segmento igual ao contact_id', async () => {
    renderPanel();
    await scheduleAttachment(createFile());

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [uploadedPath] = mocks.upload.mock.calls[0] as [string];
    expect(uploadedPath.split('/')[0]).toBe(CONTACT_ID);
  });

  it('usa ID opaco + nome seguro no restante do path', async () => {
    renderPanel();
    await scheduleAttachment(createFile('foto do cliente.png'));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [uploadedPath] = mocks.upload.mock.calls[0] as [string];
    const segments = uploadedPath.split('/');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe(CONTACT_ID);
    // <id-opaco> (uuid v4) seguido de '-' e do nome sanitizado
    expect(segments[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i);
    expect(segments[1].endsWith('.png')).toBe(true);
    expect(segments[1]).not.toMatch(/[áàâãéêíóôõúü() #%?]/i);
  });

  it('repassa o locator correspondente ao agendamento', async () => {
    renderPanel();
    await scheduleAttachment(createFile());

    await waitFor(() => expect(mocks.scheduleMessage).toHaveBeenCalledTimes(1));
    const [uploadedPath] = mocks.upload.mock.calls[0] as [string];
    const payload = mocks.scheduleMessage.mock.calls[0][0] as {
      contactId: string;
      mediaUrl?: string;
      messageType: string;
    };
    expect(payload.contactId).toBe(CONTACT_ID);
    expect(payload.mediaUrl).toBe(`${ORIGIN}/storage/v1/object/public/whatsapp-media/${uploadedPath}`);
    expect(payload.messageType).toBe('image');
  });

  it('limpa o objeto do storage quando a persistência do agendamento falha', async () => {
    mocks.scheduleMessage.mockRejectedValueOnce(new Error('insert falhou'));
    renderPanel();
    await scheduleAttachment(createFile());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    const [uploadedPath] = mocks.upload.mock.calls[0] as [string];
    expect(mocks.remove.mock.calls[0][0]).toEqual([uploadedPath]);
    expect(mocks.scheduleMessage).toHaveBeenCalledTimes(1);
  });

  it('limpa o objeto quando a referência durável (locator) não é gerada', async () => {
    mocks.getPublicUrl.mockReturnValue({ data: null });
    renderPanel();
    await scheduleAttachment(createFile());

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(mocks.scheduleMessage).not.toHaveBeenCalled();
  });

  it.each([
    'a/b.png',
    'a%b.png',
    'a?b.png',
    '../../etc.png',
    '..%2F..%2Fetc.png',
  ])('nome malicioso "%s" não muda o primeiro segmento nem injeta separador', async (name) => {
    renderPanel();
    await scheduleAttachment(createFile(name));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [uploadedPath] = mocks.upload.mock.calls[0] as [string];
    const segments = uploadedPath.split('/');
    expect(segments[0]).toBe(CONTACT_ID);
    expect(segments).toHaveLength(2);
    expect(segments[1]).not.toMatch(/[/%?]/);
    expect(segments[1]).not.toContain('..');
  });
});
