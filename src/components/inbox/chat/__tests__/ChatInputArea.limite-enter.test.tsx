/**
 * R2-INB-016 (item 312 do BACKLOG_VERIFICADO) — "Enter contorna limite de caracteres
 * aplicado ao botão Enviar" + a assinatura de texto conta nesse limite.
 *
 * O botão Enviar era desabilitado por `isOverLimit` (4096 caracteres do editor), mas o
 * Enter chamava `handleSend` direto — e `handleSend` só validava texto vazio e `isSending`.
 * Resultado: com 4097 caracteres o botão não deixava clicar, o Enter enviava assim mesmo.
 *
 * A decisão de produto (cartão t_456d8c95) estendeu essa mesma grandeza ao payload REAL:
 * a assinatura aplicada por `applySignature` conta nos 4096, porque o limite representa o
 * que sai para o canal. Sem contar esse prefixo, um corpo de 4090 caracteres com a
 * assinatura "*Ana:*\n" (7 caracteres) ultrapassava o limite com o botão ainda habilitado.
 *
 * Aqui o `ChatInputArea`, o `useChatPanelHandlers` e o `useMessageSignature` são os REAIS
 * (a mesma cadeia que o ChatPanel monta: a assinatura real alimenta os dois lados); só os
 * filhos decorativos do campo viram stubs.
 */
import { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileUploaderRef } from '@/components/inbox/FileUploader';
import type { Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  undoToast: vi.fn(),
  editMessageApi: vi.fn(),
  perfil: { name: 'Ana Souza', job_title: null as string | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // `useMessageSignature` resolve o nome do agente em `profiles` (primeiro nome = "Ana").
    auth: { getUser: async () => ({ data: { user: { id: 'agente-1' } } }) },
    from: (tabela: string) => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: tabela === 'profiles' ? mocks.perfil : null }) }),
      }),
    }),
  },
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
import { CHAR_LIMIT, medirPayloadDeEnvio, prefixoAssinaturaDeTexto } from '../useChatInputLogic';
import { useMessageSignature } from '@/hooks/chat/useMessageSignature';

type Enviar = (content: string, replyToId?: string | null) => void;

/** Assinatura real do primeiro nome do perfil mockado: `*Ana:*\n` (7 caracteres). */
const PREFIXO_ANA = '*Ana:*\n';

const mensagemEditavel = {
  id: 'msg-1',
  external_id: 'ext-1',
  content: 'mensagem original',
  sender: 'agent',
  timestamp: new Date(),
  type: 'text',
} as Message;

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

/**
 * Mesma montagem do ChatPanel, mas com a assinatura REAL (`useMessageSignature`): o par
 * (ligada + nome) desce para a barra por props e a função `applySignature` desce para o
 * comando de envio. Se o contador/botão (props) e o envio (função) medirem coisas
 * diferentes, os testes abaixo cobram a divergência.
 */
function HarnessComAssinaturaReal({
  onSendMessage,
  editarDeInicio,
}: {
  onSendMessage: Enviar;
  editarDeInicio?: Message;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileUploaderRef = useRef<FileUploaderRef>(null);
  const { signatureEnabled, agentName, applySignature } = useMessageSignature();

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
        signatureEnabled={signatureEnabled}
        signatureName={agentName}
        onToggleSignature={vi.fn()}
      />
      <span data-testid="texto-no-editor">{handlers.inputValue}</span>
      <span data-testid="assinatura-carregada">{agentName || '(sem nome)'}</span>
    </TooltipProvider>
  );
}

function campo(rotulo = 'Digite sua mensagem') {
  return screen.getByLabelText(rotulo) as HTMLTextAreaElement;
}
function botaoEnviar() {
  return screen.getByRole('button', { name: 'Enviar mensagem' });
}
/** Na edição o mesmo botão muda de rótulo (ChatInputArea: "Confirmar edição"). */
function botaoConfirmarEdicao() {
  return screen.getByRole('button', { name: 'Confirmar edição' });
}
function digitar(texto: string, rotulo?: string) {
  fireEvent.change(campo(rotulo), { target: { value: texto } });
}
function pressionarEnter(rotulo?: string) {
  fireEvent.keyDown(campo(rotulo), { key: 'Enter' });
}
function contador() {
  return document.getElementById('char-counter');
}
/** Espera a assinatura real carregar o nome do agente (perfil em `profiles` é assíncrono). */
async function carregarAssinatura() {
  await waitFor(() => expect(screen.getByTestId('assinatura-carregada')).toHaveTextContent('Ana'));
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

    render(<Harness onSendMessage={onSendMessage} editarDeInicio={mensagemEditavel} />);
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

describe('ChatInputArea — a assinatura de texto conta no limite do envio (R2-INB-016/#312)', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.toast.mockReset();
    mocks.undoToast.mockReset();
    mocks.editMessageApi.mockReset();
    cleanup();
  });

  it('o prefixo que o contador prevê é o mesmo que a assinatura real aplica', async () => {
    const { result } = renderHook(() => useMessageSignature());
    await waitFor(() => expect(result.current.agentName).toBe('Ana'));

    const corpo = 'corpo da mensagem';
    const prefixo = prefixoAssinaturaDeTexto({ enabled: true, name: 'Ana' });

    expect(result.current.applySignature(corpo)).toBe(`${prefixo}${corpo}`);
    expect(medirPayloadDeEnvio(corpo, prefixo)).toBe(result.current.applySignature(corpo).length);

    // Assinatura desligada ou sem nome do agente: nada é acrescentado — igual a applySignature.
    expect(prefixoAssinaturaDeTexto({ enabled: false, name: 'Ana' })).toBe('');
    expect(prefixoAssinaturaDeTexto({ enabled: true, name: '' })).toBe('');

    // E as duas contas concordam na fronteira: 4089 + 7 = 4096 passa, um caractere a mais não.
    const corpoNoLimite = 'a'.repeat(CHAR_LIMIT - prefixo.length);
    expect(medirPayloadDeEnvio(corpoNoLimite, prefixo)).toBe(CHAR_LIMIT);
    expect(result.current.applySignature(corpoNoLimite).length).toBe(CHAR_LIMIT);
    expect(medirPayloadDeEnvio(`${corpoNoLimite}a`, prefixo)).toBe(CHAR_LIMIT + 1);
    expect(result.current.applySignature(`${corpoNoLimite}a`).length).toBe(CHAR_LIMIT + 1);
  });

  it('no limite exato do payload assinado (4096) o botão fica habilitado e o Enter envia COM a assinatura', async () => {
    const onSendMessage = vi.fn();
    render(<HarnessComAssinaturaReal onSendMessage={onSendMessage} />);
    await carregarAssinatura();

    const corpo = 'e'.repeat(CHAR_LIMIT - PREFIXO_ANA.length);
    digitar(corpo);

    // O contador conta corpo + assinatura: é o payload que sai.
    expect(contador()?.textContent).toBe(`${CHAR_LIMIT}/${CHAR_LIMIT}`);
    expect(botaoEnviar()).toBeEnabled();

    pressionarEnter();

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe(`${PREFIXO_ANA}${corpo}`);
  });

  it('um caractere além do limite do payload assinado: contador, botão e Enter recusam no MESMO caractere', async () => {
    const onSendMessage = vi.fn();
    render(<HarnessComAssinaturaReal onSendMessage={onSendMessage} />);
    await carregarAssinatura();

    const corpo = 'f'.repeat(CHAR_LIMIT - PREFIXO_ANA.length + 1);
    digitar(corpo);

    // Mesmo excesso nos três: o contador mostra 4097, o botão está desabilitado e o Enter recusa.
    expect(contador()?.textContent).toBe(`${CHAR_LIMIT + 1}/${CHAR_LIMIT}`);
    expect(botaoEnviar()).toBeDisabled();

    pressionarEnter();

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalled();
    // A recusa não descarta o texto: o usuário encurta o que escreveu.
    expect(campo().value).toBe(corpo);
  });

  it('com a assinatura desligada o limite volta a ser o do corpo do editor', async () => {
    localStorage.setItem('chat_signature_enabled', 'false');
    const onSendMessage = vi.fn();
    render(<HarnessComAssinaturaReal onSendMessage={onSendMessage} />);
    await waitFor(() => expect(screen.getByTestId('assinatura-carregada')).toHaveTextContent('Ana'));

    const corpo = 'g'.repeat(CHAR_LIMIT);
    digitar(corpo);

    expect(contador()?.textContent).toBe(`${CHAR_LIMIT}/${CHAR_LIMIT}`);
    expect(botaoEnviar()).toBeEnabled();

    pressionarEnter();

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe(corpo);
  });

  it('na edição a assinatura não é aplicável: 4096 caracteres passam sem prefixo', async () => {
    const onSendMessage = vi.fn();
    render(<HarnessComAssinaturaReal onSendMessage={onSendMessage} editarDeInicio={mensagemEditavel} />);
    await carregarAssinatura();
    expect(campo('Editar mensagem').value).toBe('mensagem original');

    const noLimite = 'h'.repeat(CHAR_LIMIT);
    digitar(noLimite, 'Editar mensagem');

    // A edição envia o corpo cru (sem `applySignature`); contador e botão medem o mesmo.
    expect(contador()?.textContent).toBe(`${CHAR_LIMIT}/${CHAR_LIMIT}`);
    expect(botaoConfirmarEdicao()).toBeEnabled();

    pressionarEnter('Editar mensagem');

    await waitFor(() => expect(mocks.editMessageApi).toHaveBeenCalledTimes(1));
    expect(mocks.editMessageApi.mock.calls[0][1]).toMatchObject({ text: noLimite });
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
