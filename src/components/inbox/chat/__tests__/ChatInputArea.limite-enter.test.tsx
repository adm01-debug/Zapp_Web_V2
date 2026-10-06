/**
 * R2-INB-016 (item 312 do BACKLOG_VERIFICADO) — "Enter contorna limite de caracteres
 * aplicado ao botão Enviar".
 *
 * O botão Enviar era desabilitado por `isOverLimit` (4096 caracteres do editor), mas o
 * Enter chamava `handleSend` direto — e `handleSend` só validava texto vazio e `isSending`.
 * Resultado: com 4097 caracteres o botão não deixava clicar, o Enter enviava assim mesmo.
 * Aqui o `ChatInputArea` e o `useChatPanelHandlers` são os REAIS (o mesmo par que o
 * ChatPanel monta); só os filhos decorativos do campo viram stubs.
 */
import { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileUploaderRef } from '@/components/inbox/FileUploader';
import type { Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  undoToast: vi.fn(),
  editMessageApi: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: (...args: unknown[]) => mocks.undoToast(...args) }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: () => ({ value: null }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
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

// Filhos decorativos do campo: nada disso participa do limite/acionamento testado.
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

import { ChatInputArea } from '../ChatInputArea';
import { useChatPanelHandlers } from '../useChatPanelHandlers';
import { CHAR_LIMIT } from '../useChatInputLogic';

type Enviar = (content: string, replyToId?: string | null) => void;

/**
 * Monta o par real do ChatPanel: `useChatPanelHandlers` dono do texto/acionamento e
 * `ChatInputArea` dono do campo e do botão. `applySignature` fica sob controle do teste;
 * o limite medido é o do texto do editor (o mesmo que o botão usa).
 */
function Harness({
  onSendMessage,
  applySignature = (t: string) => t,
  editarDeInicio,
}: {
  onSendMessage: Enviar;
  applySignature?: (text: string) => string;
  editarDeInicio?: Message;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileUploaderRef = useRef<FileUploaderRef>(null);

  const handlers = useChatPanelHandlers({
    conversationId: 'conv-1',
    contactId: 'contato-limite',
    contactPhone: '5511999999999',
    instanceName: 'instancia-1',
    onSendMessage,
    editMessageApi: mocks.editMessageApi,
    applySignature,
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    handleSetActiveTool: vi.fn(),
  });

  // Entra no modo de edição pelo MESMO handler que a barra de ações da mensagem usa.
  const jaEntrouEmEdicao = useRef(false);
  useEffect(() => {
    if (!editarDeInicio || jaEntrouEmEdicao.current) return;
    jaEntrouEmEdicao.current = true;
    handlers.handleEditStart(editarDeInicio);
  }, [editarDeInicio, handlers]);

  return (
    <TooltipProvider>
      <ChatInputArea
        inputValue={handlers.inputValue}
        replyToMessage={handlers.replyToMessage}
        editingMessage={handlers.editingMessage}
        isRecordingAudio={handlers.isRecordingAudio}
        showSlashCommands={false}
        contactId="contato-limite"
        contactPhone="5511999999999"
        contactName="Contato Teste"
        instanceName="instancia-1"
        messages={[]}
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
      {/* Espelho do estado do hook: prova, sem re-render extra, o que sobrou no editor. */}
      <span data-testid="texto-no-editor">{handlers.inputValue}</span>
    </TooltipProvider>
  );
}

function campo(rotulo = 'Digite sua mensagem') {
  return screen.getByLabelText(rotulo) as HTMLTextAreaElement;
}
function botaoEnviar() {
  return screen.getByRole('button', { name: 'Enviar mensagem' });
}
function digitar(texto: string, rotulo?: string) {
  fireEvent.change(campo(rotulo), { target: { value: texto } });
}
function pressionarEnter(rotulo?: string) {
  fireEvent.keyDown(campo(rotulo), { key: 'Enter' });
}

describe('ChatInputArea — o limite do editor vale para Enter e para o botão (R2-INB-016)', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.toast.mockReset();
    mocks.undoToast.mockReset();
    mocks.editMessageApi.mockReset();
    cleanup();
  });

  it('Enter com 4097 caracteres não envia e devolve o texto intacto ao editor', () => {
    const onSendMessage = vi.fn();
    render(<Harness onSendMessage={onSendMessage} />);

    const excedente = 'a'.repeat(CHAR_LIMIT + 1);
    digitar(excedente);

    // Pré-condição do achado: o botão está desabilitado neste estado.
    expect(botaoEnviar()).toBeDisabled();

    pressionarEnter();

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(campo().value).toBe(excedente);
    expect(screen.getByTestId('texto-no-editor')).toHaveTextContent(excedente);
    // A recusa é anunciada — não pode ser um acionamento silencioso.
    expect(mocks.toast).toHaveBeenCalled();
  });

  it('no limite exato (4096) o Enter continua enviando', () => {
    const onSendMessage = vi.fn();
    render(<Harness onSendMessage={onSendMessage} />);

    const noLimite = 'b'.repeat(CHAR_LIMIT);
    digitar(noLimite);

    expect(botaoEnviar()).toBeEnabled();
    pressionarEnter();

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(noLimite, null);
    expect(screen.getByTestId('texto-no-editor')).toHaveTextContent('');
  });

  it('na edição, o texto acima do limite não chega em editMessageApi nem some do editor', () => {
    const onSendMessage = vi.fn();
    const editavel = {
      id: 'msg-1',
      external_id: 'ext-1',
      content: 'mensagem original',
      sender: 'agent',
      timestamp: new Date(),
      type: 'text',
    } as Message;

    render(<Harness onSendMessage={onSendMessage} editarDeInicio={editavel} />);
    expect(campo('Editar mensagem').value).toBe('mensagem original');

    const excedente = 'd'.repeat(CHAR_LIMIT + 1);
    digitar(excedente, 'Editar mensagem');
    pressionarEnter('Editar mensagem');

    expect(mocks.editMessageApi).not.toHaveBeenCalled();
    expect(screen.getByTestId('texto-no-editor')).toHaveTextContent(excedente);
    // Continua no modo de edição (o texto recusado não foi descartado).
    expect(campo('Editar mensagem').value).toBe(excedente);
  });
});
