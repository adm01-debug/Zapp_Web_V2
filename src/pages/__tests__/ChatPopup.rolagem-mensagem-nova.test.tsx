/**
 * P2 #320 / R2-INB-025 — mensagem nova e indicador de digitacao nao podem
 * arrastar a lista enquanto o agente le o historico.
 *
 * O caminho montado e o REAL (`ChatPopup -> ChatPanel -> ChatMessagesArea`); so
 * as fachadas dos hooks que dependem de rede entram como mock. A posicao do
 * usuario e simulada nas medidas do contêiner de rolagem (o jsdom nao tem
 * layout) e o que se observa e o `scrollTop` final — o que o usuario ve:
 *   - lendo o historico: nem mensagem nova nem "digitando..." podem mover a lista;
 *   - no fim da conversa: a lista continua acompanhando (mensagem nova e
 *     indicador de digitacao seguem rolando ao fim, como antes).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ALTURA_JANELA = 600;
const ALTURA_ESTIMADA = 100; // estimateSize do ChatMessagesArea
const MENSAGENS = 30;

/**
 * O jsdom nao da layout: sem medida do contêiner o virtualizador nao renderiza
 * item nenhum. O virtual-core le `offsetHeight` do elemento de rolagem (nao
 * getBoundingClientRect), entao a medida entra por aí — e por instancia, sem
 * mexer no ResizeObserver: um observer que responde a cada elemento realimenta
 * a medicao ate estourar "Maximum update depth exceeded".
 */
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

/**
 * O virtual-core rola pela API do navegador (`Element.scrollTo`), que o jsdom
 * nao implementa. O stub troca o "navegador que falta" por um que registra a
 * chamada E aplica o `top` em `scrollTop` — assim a asserção e sobre o que o
 * usuario veria na tela, nao sobre um mock do componente.
 */
const scrollToSpy = vi.fn();
const protoHtml = HTMLElement.prototype as unknown as Record<string, unknown>;
const scrollToOriginal = protoHtml.scrollTo;
protoHtml.scrollTo = function (this: HTMLElement, opcoes?: ScrollToOptions | number) {
  scrollToSpy(opcoes);
  this.scrollTop = typeof opcoes === 'number' ? opcoes : opcoes?.top ?? 0;
};

afterAll(() => {
  if (scrollToOriginal) protoHtml.scrollTo = scrollToOriginal;
  else delete protoHtml.scrollTo;
});

const CONTACT_ID = 'contato-rolagem-1';

const mocks = vi.hoisted(() => ({
  messages: {} as Record<string, unknown>,
  contactId: '' as string,
  isContactTyping: false,
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => mocks.messages,
}));

// A unica coisa que o popup consome do roteador e o `contactId` da janela.
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

// ---- dependencias internas do ChatPanel (precedente: ChatPopup.pagination) ----
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
  useTypingPresence: () => ({
    isContactTyping: mocks.isContactTyping,
    typingUsers: mocks.isContactTyping ? [{ name: 'Maria Silva' }] : [],
    handleTypingStart: vi.fn(), handleTypingStop: vi.fn(),
  }),
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
vi.mock('@/components/inbox/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid="bubble" data-message-id={message.id}>{message.content}</div>
  ),
}));
// Marcador: da para ver na tela que o "digitando..." esta ativo.
vi.mock('@/components/inbox/TypingIndicator', () => ({
  TypingIndicator: ({ isVisible }: { isVisible: boolean }) => (isVisible ? <div data-testid="digitando" /> : null),
}));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined) },
}));

import ChatPopup from '../ChatPopup';

/** Linha no formato cru que o `useMessages` entrega ao popup. */
function rawRow(n: number) {
  return {
    id: `msg-${String(n).padStart(4, '0')}`,
    content: `mensagem ${n}`,
    message_type: 'text',
    sender: n % 2 === 0 ? 'agent' : 'contact',
    created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString(),
    status: 'sent',
    is_read: true,
  };
}

function conversa(quantidade = MENSAGENS) {
  return Array.from({ length: quantidade }, (_, i) => rawRow(i + 1));
}

function useMessagesState(overrides: Record<string, unknown> = {}) {
  return {
    messages: conversa(),
    loading: false,
    error: null,
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(async () => {}),
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
  // por referência e o popup nao veria o novo estado da fachada.
  const { rerender } = render(buildUi());
  return { rerender: () => rerender(buildUi()) };
}

function superficie() {
  // O ChatPanel entra por `lazy` no popup: a area de mensagens so existe depois
  // de a promessa resolver, entao a busca e assincrona.
  return screen.findByRole('log', { name: /mensagens da conversa/i });
}

/** Altura da lista virtualizada = quantas linhas a area recebeu do popup. */
function alturaDaLista(el: HTMLElement): number {
  const lista = Array.from(el.querySelectorAll<HTMLElement>('div')).find((d) =>
    /^\d+px$/.test(d.style.height),
  );
  if (!lista) throw new Error('lista virtualizada nao encontrada dentro do role=log');
  return Number(lista.style.height.replace('px', ''));
}

/**
 * Coloca o contêiner no estado que o navegador teria e avisa a tela, pelo
 * caminho do usuario: altura do conteudo, altura da janela e onde ele parou.
 * O evento de rolagem e o que informa a posicao — e o que o componente usa para
 * decidir se pode acompanhar o fim.
 */
function rolarPara(el: HTMLElement, conteudo: number, topo: number, janela = ALTURA_JANELA) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: conteudo });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: janela });
  el.scrollTop = topo;
  fireEvent.scroll(el);
}

/** O fim da lista muda de tamanho quando entra mensagem nova / o "digitando...". */
function crescerConteudo(el: HTMLElement, conteudo: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: conteudo });
}

const CONTEUDO_30 = MENSAGENS * ALTURA_ESTIMADA; // 3000px de lista
const CONTEUDO_31 = (MENSAGENS + 1) * ALTURA_ESTIMADA; // 3100px depois da nova
const FIM_30 = CONTEUDO_30 - ALTURA_JANELA; // 2400
const FIM_31 = CONTEUDO_31 - ALTURA_JANELA; // 2500

beforeEach(() => {
  vi.clearAllMocks();
  scrollToSpy.mockClear();
  mocks.contactId = CONTACT_ID;
  mocks.isContactTyping = false;
  mocks.messages = useMessagesState();
});

describe('ChatPopup — rolagem com mensagem nova e indicador de digitacao (P2 #320)', () => {
  it('nao arrasta a lista quando chega mensagem nova durante a leitura do historico', async () => {
    const medir = medirLayout();
    try {
      const { rerender } = renderPopup();
      const el = await superficie();
      // A conversa abre no fim (comportamento esperado na entrada).
      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      scrollToSpy.mockClear();

      // O agente rola ate o topo e passa a ler o historico.
      rolarPara(el, CONTEUDO_30, 0);
      expect(el.scrollTop).toBe(0);

      // Chega mensagem nova: a lista cresce um item (31 linhas).
      crescerConteudo(el, CONTEUDO_31);
      mocks.messages = useMessagesState({ messages: conversa(MENSAGENS + 1) });
      rerender();

      // A mensagem nova entra na tela (a lista passa de 30 para 31 linhas)...
      await waitFor(() => expect(alturaDaLista(el)).toBe(CONTEUDO_31));
      // ...e o scroll do agente fica exatamente onde estava.
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(el.scrollTop).toBe(0);
    } finally {
      medir.mockRestore();
    }
  });

  it('nao arrasta a lista quando o contato comeca a digitar durante a leitura', async () => {
    const medir = medirLayout();
    try {
      const { rerender } = renderPopup();
      const el = await superficie();
      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      scrollToSpy.mockClear();

      rolarPara(el, CONTEUDO_30, 0);

      // O indicador de digitacao aparece (o "digitando..." ocupa espaco no fim).
      mocks.isContactTyping = true;
      rerender();
      await screen.findByTestId('digitando');

      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(el.scrollTop).toBe(0);
    } finally {
      medir.mockRestore();
    }
  });

  it('continua acompanhando o fim quando a mensagem nova chega com o agente no fim', async () => {
    const medir = medirLayout();
    try {
      const { rerender } = renderPopup();
      const el = await superficie();
      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      scrollToSpy.mockClear();

      rolarPara(el, CONTEUDO_30, FIM_30);
      expect(el.scrollTop).toBe(FIM_30);

      crescerConteudo(el, CONTEUDO_31);
      mocks.messages = useMessagesState({ messages: conversa(MENSAGENS + 1) });
      rerender();

      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      expect(el.scrollTop).toBe(FIM_31);
    } finally {
      medir.mockRestore();
    }
  });

  it('leva ao fim quem esta logo acima dele quando o contato aparece digitando', async () => {
    const medir = medirLayout();
    try {
      const { rerender } = renderPopup();
      const el = await superficie();
      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      scrollToSpy.mockClear();

      // 50px acima do fim: ainda acompanhando a conversa.
      rolarPara(el, CONTEUDO_30, FIM_30 - 50);

      mocks.isContactTyping = true;
      rerender();
      await screen.findByTestId('digitando');

      await waitFor(() => expect(el.scrollTop).toBe(FIM_30));
    } finally {
      medir.mockRestore();
    }
  });
});
