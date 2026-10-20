/**
 * R2-INB-004 (etapa 3/3) — o histórico antigo tem de ser alcançável também na rota
 * ChatPopup (janela destacada do chat).
 *
 * O popup já chamava `useMessages`, mas extraía apenas `messages`/`loading` e
 * descartava `hasOlder`/`loadingOlder`/`loadOlderMessages` do hook — ou seja,
 * mesmo com a Inbox principal corrigida, a janela do popup ficava presa nas
 * últimas 1000 mensagens, sem nenhum caminho de UI para o histórico anterior.
 *
 * O teste monta o caminho REAL `ChatPopup -> ChatPanel -> ChatMessagesArea`
 * (só o `useMessages` — e o `contactId` da rota — vem de fachada controlada) e
 * prova, por página:
 *   - a página de 1000 mensagens carregada + `hasOlder` = controle visível;
 *   - um clique = exatamente uma chamada ao `loadOlderMessages` do hook, e o
 *     `loadingOlder` do hook (não um estado paralelo) desabilita o controle e
 *     impede disparo concorrente;
 *   - depois do lote antigo, a mensagem MAIS ANTIGA (fora da página inicial de
 *     1000) passa a existir na lista renderizada e o início do histórico é
 *     anunciado de forma acessível.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O jsdom não dá layout: sem medida do contêiner o virtualizador não renderiza
// item nenhum. O virtual-core lê `offsetHeight` do elemento de rolagem (não
// getBoundingClientRect), então a medida entra por aí — e por instância, sem
// mexer no ResizeObserver: um observer que responde a cada elemento realimenta
// a medição até estourar "Maximum update depth exceeded" e derrubar a árvore.
const ALTURA_JANELA = 600;
/** Mede o contêiner de rolagem como janela; as linhas ficam na estimativa. */
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

const CONTACT_ID = 'contato-popup-1';

/**
 * Teto de espera das consultas assíncronas (`findBy*`/`waitFor`).
 *
 * O padrão do Testing Library é 1000 ms e, com a máquina carregada, a montagem
 * do caminho real `ChatPopup -> ChatPanel -> ChatMessagesArea` (1000 linhas
 * virtualizadas) passa desse teto: o teste falhava por tempo, não por
 * comportamento (`Unable to find role="button" ...`, medido entre 1101 ms e
 * 1423 ms sob carga). A espera continua sendo por ESTADO real — a consulta é a
 * mesma e a asserção não muda; só o teto fica explícito e dimensionado.
 * Isto não é sleep: nada aqui espera tempo fixo.
 */
const ESPERA_ESTADO_REAL = 5000;

const mocks = vi.hoisted(() => ({
  loadOlderMessages: vi.fn(async () => {}),
  /** Retorno controlado do `useMessages` (fachada do hook). */
  messages: {} as Record<string, unknown>,
  contactId: '' as string,
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => mocks.messages,
}));

// A única coisa que o popup consome do roteador é o `contactId` da janela.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ contactId: mocks.contactId }) };
});

const CONTACT_ROW = {
  id: CONTACT_ID,
  name: 'Maria Silva',
  phone: '+551****9999',
  avatar_url: null,
  email: null,
  tags: [],
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ai_priority: null,
  status: 'open',
  last_message: 'oi',
  unread_count: 0,
  assigned_to: null,
};

// O popup busca o contato em `contacts`; nenhum teste fala com a rede.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CONTACT_ROW, error: null }) }) }),
    }),
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---- dependências internas do ChatPanel (precedente: ChatPanel.scheduled-media) ----
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
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: vi.fn() }),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

// ---- vizinhos da ChatMessagesArea (ela fica REAL) ----
// A bolha real é pesada; aqui vira um marcador com o conteúdo, para observar
// exatamente QUAL mensagem está renderizada.
vi.mock('@/components/inbox/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid="bubble" data-message-id={message.id}>{message.content}</div>
  ),
}));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined) },
}));

import ChatPopup from '../ChatPopup';

const PAGE_SIZE = 1000;
const TOTAL = 1005; // 1000 + 5 → o histórico antigo exige uma segunda página
const ALTURA_ESTIMADA = 100; // estimateSize do ChatMessagesArea
const MAIS_ANTIGA_ID = 'msg-0001';
const CARREGAR = /carregar mensagens anteriores/i;

/** Altura da lista virtualizada = quantas linhas a área recebeu do popup. */
function alturaDaLista(): number {
  const superficie = screen.getByRole('log', { name: /mensagens da conversa/i });
  const lista = Array.from(superficie.querySelectorAll<HTMLElement>('div')).find((d) =>
    /^\d+px$/.test(d.style.height),
  );
  if (!lista) throw new Error('lista virtualizada nao encontrada dentro do role=log');
  return Number(lista.style.height.replace('px', ''));
}

/** Linha no formato cru que o `useMessages` entrega ao popup. */
function rawRow(n: number) {
  return {
    id: `msg-${String(n).padStart(4, '0')}`,
    content: n === 1 ? 'mensagem mais antiga' : `mensagem ${n}`,
    message_type: 'text',
    sender: n % 2 === 0 ? 'agent' : 'contact',
    created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString(),
    status: 'sent',
    is_read: true,
  };
}

/** Toda a conversa, em ordem cronológica (o mais antigo no índice 0). */
function fullHistory() {
  return Array.from({ length: TOTAL }, (_, i) => rawRow(i + 1));
}

/** Primeira página: as PAGE_SIZE mensagens mais recentes. */
function newestPage() {
  return fullHistory().slice(TOTAL - PAGE_SIZE);
}

function useMessagesState(overrides: Record<string, unknown> = {}) {
  return {
    messages: newestPage(),
    loading: false,
    error: null,
    hasOlder: true,
    loadingOlder: false,
    loadOlderMessages: mocks.loadOlderMessages,
    ...overrides,
  };
}

function buildUi() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ChatPopup />
    </QueryClientProvider>
  );
}

function renderPopup() {
  // Elemento novo a cada render: o React balança (bail out) com props idênticas
  // por referência e o popup não veria o novo estado da fachada.
  const { rerender } = render(buildUi());
  return { rerender: () => rerender(buildUi()) };
}

// A PRIMEIRA espera do arquivo pagava, DENTRO do orçamento de asserção, a avaliação
// única do módulo `ChatPanel` — o popup o carrega por `lazy()`. O dump vermelho dos
// logs do integrador (12 reprovações, todas nesta asserção) mostra sempre o MESMO
// quadro: a barra de controles da janela já renderizada e o fallback "Carregando
// conversa..." no lugar da lista. Ou seja: o `findByRole` de 5 s estava esperando a
// fila de transformação do Vite, que sob carga passa do orçamento — e o teste caía
// por TEMPO, não por comportamento (o botão aparece no mesmo instante em que o
// módulo resolve). Aquecer o módulo aqui, uma vez por arquivo e fora da asserção,
// tira essa carga única do caminho medido: o `lazy()` seguinte resolve do cache do
// runner. Nada aqui espera tempo fixo e nenhuma asserção mudou.
beforeAll(async () => {
  await import('@/components/inbox/ChatPanel');
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contactId = CONTACT_ID;
  mocks.messages = useMessagesState();
});

describe('ChatPopup — histórico antigo alcançável (R2-INB-004)', () => {
  it('expõe o controle do histórico antigo quando o hook publica hasOlder', async () => {
    renderPopup();

    const botao = await screen.findByRole('button', { name: CARREGAR }, { timeout: ESPERA_ESTADO_REAL });
    expect(botao).toBeEnabled();
    // A área de mensagens recebeu a 1ª página (1000 linhas), sem o controle de
    // "início do histórico": ainda há lote antigo por carregar.
    expect(alturaDaLista()).toBe(PAGE_SIZE * ALTURA_ESTIMADA);
    expect(screen.queryByTestId('history-start')).toBeNull();
  });

  it('não oferece o controle quando o hook diz que o histórico começou', async () => {
    mocks.messages = useMessagesState({ hasOlder: false });
    renderPopup();

    await screen.findByRole('log', { name: /mensagens da conversa/i }, { timeout: ESPERA_ESTADO_REAL });
    expect(screen.queryByRole('button', { name: CARREGAR })).toBeNull();
    expect(screen.getByTestId('history-start')).toBeInTheDocument();
    expect(mocks.loadOlderMessages).not.toHaveBeenCalled();
  });

  it('leva um clique a exatamente uma chamada e o loading do hook impede concorrência', async () => {
    const { rerender } = renderPopup();

    const botao = await screen.findByRole('button', { name: CARREGAR }, { timeout: ESPERA_ESTADO_REAL });
    fireEvent.click(botao);
    expect(mocks.loadOlderMessages).toHaveBeenCalledTimes(1);

    // O hook publica loadingOlder=true durante a promessa: quem desabilita é a
    // prop que o popup repassa (loadingOlderMessages), não um estado paralelo.
    mocks.messages = useMessagesState({ loadingOlder: true });
    rerender();

    const emCarga = await screen.findByRole('button', { name: CARREGAR }, { timeout: ESPERA_ESTADO_REAL });
    expect(emCarga).toBeDisabled();
    expect(emCarga).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('older-loading-status')).toHaveTextContent(/carregando mensagens anteriores/i);

    fireEvent.click(emCarga);
    fireEvent.click(emCarga);
    expect(mocks.loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('depois do lote antigo a mensagem fora da página de 1000 fica alcançável', async () => {
    // A janela de rolagem precisa de medida ANTES da montagem: o virtualizador lê
    // o rect do contêiner uma vez, quando ele entra na árvore.
    const medir = medirLayout();
    try {
      const { rerender } = renderPopup();

      fireEvent.click(await screen.findByRole('button', { name: CARREGAR }, { timeout: ESPERA_ESTADO_REAL }));
      expect(mocks.loadOlderMessages).toHaveBeenCalledTimes(1);

      // O hook entrega o lote anterior e fecha o histórico (1005 no total).
      mocks.messages = useMessagesState({
        messages: fullHistory(),
        hasOlder: false,
      });
      rerender();

      // Início do histórico anunciado de forma acessível, e a lista passou a ter a
      // conversa inteira (1005 linhas) — o lote antigo saiu do popup e chegou aqui.
      await screen.findByTestId('history-start', undefined, { timeout: ESPERA_ESTADO_REAL });
      expect(alturaDaLista()).toBe(TOTAL * ALTURA_ESTIMADA);

      // ...e a mensagem mais antiga (índice 0, fora da página inicial de 1000)
      // está renderizada na lista.
      const superficie = screen.getByRole('log', { name: /mensagens da conversa/i });
      superficie.scrollTop = 0;
      fireEvent.scroll(superficie);

      await waitFor(() => {
        expect(document.querySelector(`[data-message-id="${MAIS_ANTIGA_ID}"]`)).not.toBeNull();
      }, { timeout: ESPERA_ESTADO_REAL });
      expect(document.querySelector(`[data-message-id="${MAIS_ANTIGA_ID}"]`)?.textContent)
        .toBe('mensagem mais antiga');
    } finally {
      medir.mockRestore();
    }
  });
});
