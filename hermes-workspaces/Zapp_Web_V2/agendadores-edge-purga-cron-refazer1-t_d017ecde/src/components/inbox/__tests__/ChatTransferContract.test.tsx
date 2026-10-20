/**
 * t_ad66478a / R2-INB-009 item 88 — contrato de transferência do header do chat.
 * Refazer 2 (t_ff895f31): as duas escritas viraram UMA RPC atômica
 * (`transfer_conversation`, migration 20261005185729) — update do contato e
 * insert do evento acontecem na mesma transação do Postgres.
 *
 * O TransferDialog (cartão pai t_d48c98d1) já expõe só `agent | queue` via
 * `TransferTargetType` e só fecha quando o `onTransfer` resolve. Este teste
 * monta o ChatPanel real com ChatDialogs e TransferDialog reais (apenas hooks
 * e componentes visuais periféricos mockados), abre o diálogo pelo mesmo
 * evento que o painel lateral dispara (`open-transfer-dialog`) e observa o
 * Supabase mockado:
 *
 *   - o único caminho de escrita é `supabase.rpc('transfer_conversation', …)` —
 *     NENHUM `from('contacts').update`/`from('conversation_events').insert`
 *     pode persistir estado parcial (prova estrutural do lado do cliente);
 *   - erro da RPC rejeita o callback → diálogo aberto + toast de erro;
 *   - comportamento de rollback no banco (evento falha ⇒ contato intacto) é
 *     provado contra a função real em
 *     `supabase/tests/transfer_conversation_atomicidade.sql`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import type { Conversation, Message } from '@/types/chat';

// Polyfills mínimos para Radix Select/Dialog no jsdom (mesmo padrão de
// EditContactDialog.test.tsx).
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  fromCalls: [] as string[],
  rpcError: null as { message: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
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

// Dependências do TransferDialog real (o componente sob teste de contrato).
const CURRENT_USER_ID = 'me-auth-id';
const AGENTS = [
  { id: 'me-profile', user_id: CURRENT_USER_ID, name: 'Eu Mesmo', avatar_url: null, status: 'online', activeChats: 0, max_chats: 5 },
  { id: 'colega-profile', user_id: 'colega-auth-id', name: 'Colega Um', avatar_url: null, status: 'online', activeChats: 0, max_chats: 5 },
];
const QUEUES = [{ id: 'queue-2', name: 'Fila Suporte', color: '#22c55e' }];

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: CURRENT_USER_ID } }),
}));
vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: AGENTS, isLoading: false }),
}));
vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: QUEUES, loading: false }),
}));

// Componentes visuais/lazy periféricos — inócuos. ChatDialogs e TransferDialog
// NÃO são mockados: o contrato entre eles é o que este teste prova.
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../AIConversationAssistant', () => ({ AIConversationAssistant: () => null }));
vi.mock('../CloseConversationDialog', () => ({ CloseConversationDialog: () => null }));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';
const QUEUE_ATUAL = 'queue-77';

const conversation: Conversation = {
  id: 'conv-1',
  contact: {
    id: CONTACT_ID,
    name: 'Maria Silva',
    phone: '+5511999999999',
    queue_id: QUEUE_ATUAL,
    assigned_to: 'me-profile',
  },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Monta o painel e abre o TransferDialog pelo mesmo evento do tile "Transferir". */
async function openTransferDialog() {
  render(<ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />);
  await act(async () => {
    window.dispatchEvent(new CustomEvent('open-transfer-dialog', { detail: { contactId: CONTACT_ID } }));
  });
  // O diálogo é lazy: o título só aparece quando o chunk resolve e o portal monta.
  await screen.findByText('Transferir Chat');
}

function clickTransferir() {
  fireEvent.click(screen.getByRole('button', { name: /^transferir$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpcCalls.length = 0;
  mocks.fromCalls.length = 0;
  mocks.rpcError = null;
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    mocks.rpcCalls.push({ name, args });
    return Promise.resolve({ data: 'evt-mock-id', error: mocks.rpcError });
  });
  mocks.from.mockImplementation((table: string) => {
    mocks.fromCalls.push(table);
    throw new Error(`tabela inesperada no teste: ${table}`);
  });
});

describe('ChatPanel → TransferDialog — contrato de transferência (#88)', () => {
  it('entrega o queueId real do contato ao diálogo (colegas não são filtrados)', async () => {
    await openTransferDialog();

    // Com queue_id preenchido, o picker lista colegas; sem ele (bug), o diálogo
    // cai no modo self-claim e só mostraria "Eu Mesmo".
    expect(screen.getByText('Colega Um')).toBeInTheDocument();
    expect(screen.queryByText(/só é possível assumir para você mesmo/i)).not.toBeInTheDocument();
  });

  it('transferência para AGENTE chama a RPC atômica com to_agent_id e a nota', async () => {
    await openTransferDialog();
    fireEvent.click(screen.getByText('Colega Um'));
    fireEvent.change(screen.getByPlaceholderText(/Deixe uma mensagem/i), {
      target: { value: 'Cliente pediu urgência' },
    });
    clickTransferir();

    await waitFor(() => expect(mocks.rpcCalls).toHaveLength(1));
    const call = mocks.rpcCalls[0];
    expect(call.name).toBe('transfer_conversation');
    expect(call.args).toEqual({
      p_contact_id: CONTACT_ID,
      p_to_agent_id: 'colega-profile',
      p_to_queue_id: null,
      p_note: 'Cliente pediu urgência',
    });
    // Nenhuma escrita solta: update+evento vivem dentro da transação da função.
    expect(mocks.from).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }))
    );
  });

  it('transferência para FILA chama a RPC atômica com to_queue_id', async () => {
    await openTransferDialog();
    fireEvent.click(screen.getByRole('radio', { name: /departamento/i }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: /Fila Suporte/i }));
    fireEvent.change(screen.getByPlaceholderText(/Deixe uma mensagem/i), {
      target: { value: 'Fila com contexto' },
    });
    clickTransferir();

    await waitFor(() => expect(mocks.rpcCalls).toHaveLength(1));
    const call = mocks.rpcCalls[0];
    expect(call.name).toBe('transfer_conversation');
    expect(call.args).toEqual({
      p_contact_id: CONTACT_ID,
      p_to_agent_id: null,
      p_to_queue_id: 'queue-2',
      p_note: 'Fila com contexto',
    });
    expect(mocks.from).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }))
    );
  });

  it('falha na RPC rejeita o callback, mantém o diálogo aberto e NÃO grava nada solto', async () => {
    // A RPC falha = a transação da função abortou inteira: nem o UPDATE do
    // contato nem o INSERT do evento persistem (o rollback em si é provado
    // contra a função real em supabase/tests/transfer_conversation_atomicidade.sql).
    mocks.rpcError = { message: 'insert do evento negado' };
    await openTransferDialog();
    fireEvent.click(screen.getByText('Colega Um'));
    clickTransferir();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao transferir' }))
    );
    // Rejeição observável: o diálogo real só fecha quando onTransfer resolve.
    expect(screen.getByText('Transferir Chat')).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }));

    // Atomicidade observável no cliente: a transferência só pode existir como a
    // ÚNICA chamada da RPC transacional — nenhum update/insert avulso saiu.
    expect(mocks.rpcCalls).toHaveLength(1);
    expect(mocks.rpcCalls[0].name).toBe('transfer_conversation');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
