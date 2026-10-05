/**
 * t_ad66478a / R2-INB-009 item 88 — contrato de transferência do header do chat.
 *
 * O TransferDialog (cartão pai t_d48c98d1) já expõe só `agent | queue` via
 * `TransferTargetType` e só fecha quando o `onTransfer` resolve. O consumidor
 * (ChatPanel → ChatDialogs → TransferDialog) estava quebrado em quatro pontos:
 *
 *   1. `queueId` nunca era passado ao diálogo → `isQueueless` sempre verdadeiro
 *      → o picker filtrava todos os colegas indevidamente;
 *   2. `ChatDialogs` fazia cast do callback para um tipo com `connection`,
 *      escondendo a incompatibilidade de contrato;
 *   3. a nota digitada no diálogo era descartada — nada ia para
 *      `conversation_events.metadata.note`;
 *   4. `handleTransfer` engolia o erro do update (`return` após o toast), então
 *      a Promise resolvia e o diálogo fechava como se tivesse dado certo.
 *
 * Este teste monta o ChatPanel real com ChatDialogs e TransferDialog reais
 * (apenas hooks e componentes visuais periféricos mockados), abre o diálogo pelo
 * mesmo evento que o painel lateral dispara (`open-transfer-dialog`) e observa
 * as duas escritas no Supabase mockado: o update em `contacts` e o insert em
 * `conversation_events` com `event_type='transfer'`.
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
  from: vi.fn(),
  updates: [] as { data: Record<string, unknown>; eqCol: string; eqVal: unknown }[],
  inserts: [] as Record<string, unknown>[],
  updateError: null as { message: string } | null,
  insertError: null as { message: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
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
  mocks.updates.length = 0;
  mocks.inserts.length = 0;
  mocks.updateError = null;
  mocks.insertError = null;
  mocks.from.mockImplementation((table: string) => {
    if (table === 'contacts') {
      return {
        update: (data: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            mocks.updates.push({ data, eqCol: col, eqVal: val });
            return Promise.resolve({ error: mocks.updateError });
          },
        }),
      };
    }
    if (table === 'conversation_events') {
      return {
        insert: (payload: Record<string, unknown>) => {
          mocks.inserts.push(payload);
          return Promise.resolve({ error: mocks.insertError });
        },
      };
    }
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

  it('transferência para AGENTE atualiza assigned_to e grava to_agent_id + nota', async () => {
    await openTransferDialog();
    fireEvent.click(screen.getByText('Colega Um'));
    fireEvent.change(screen.getByPlaceholderText(/Deixe uma mensagem/i), {
      target: { value: 'Cliente pediu urgência' },
    });
    clickTransferir();

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0].data).toEqual({ assigned_to: 'colega-profile' });
    expect(mocks.updates[0].eqCol).toBe('id');
    expect(mocks.updates[0].eqVal).toBe(CONTACT_ID);

    await waitFor(() => expect(mocks.inserts).toHaveLength(1));
    const evt = mocks.inserts[0];
    expect(evt.contact_id).toBe(CONTACT_ID);
    expect(evt.event_type).toBe('transfer');
    expect(evt.to_agent_id).toBe('colega-profile');
    expect(evt.to_queue_id ?? null).toBeNull();
    expect(evt.metadata).toMatchObject({ note: 'Cliente pediu urgência' });

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }))
    );
  });

  it('transferência para FILA atualiza queue_id e grava to_queue_id', async () => {
    await openTransferDialog();
    fireEvent.click(screen.getByRole('radio', { name: /departamento/i }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: /Fila Suporte/i }));
    fireEvent.change(screen.getByPlaceholderText(/Deixe uma mensagem/i), {
      target: { value: 'Fila com contexto' },
    });
    clickTransferir();

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0].data).toEqual({ queue_id: 'queue-2' });

    await waitFor(() => expect(mocks.inserts).toHaveLength(1));
    const evt = mocks.inserts[0];
    expect(evt.contact_id).toBe(CONTACT_ID);
    expect(evt.event_type).toBe('transfer');
    expect(evt.to_queue_id).toBe('queue-2');
    expect(evt.to_agent_id ?? null).toBeNull();
    expect(evt.metadata).toMatchObject({ note: 'Fila com contexto' });
  });

  it('falha no update da conversa rejeita o callback e mantém o diálogo aberto', async () => {
    mocks.updateError = { message: 'rls negou' };
    await openTransferDialog();
    fireEvent.click(screen.getByText('Colega Um'));
    clickTransferir();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao transferir' }))
    );
    // Rejeição observável: o diálogo real só fecha quando onTransfer resolve.
    expect(screen.getByText('Transferir Chat')).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }));
    // Não pode gravar evento órfão de uma transferência que não aconteceu.
    expect(mocks.inserts).toHaveLength(0);
  });

  it('falha no insert do evento rejeita o callback e mantém o diálogo aberto', async () => {
    mocks.insertError = { message: 'insert negado' };
    await openTransferDialog();
    fireEvent.click(screen.getByText('Colega Um'));
    clickTransferir();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao transferir' }))
    );
    expect(screen.getByText('Transferir Chat')).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat transferido!' }));
    expect(mocks.inserts).toHaveLength(1);
  });
});
