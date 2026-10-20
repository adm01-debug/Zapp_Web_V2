/**
 * R2-INB-017 (item 313) — Atalhos de busca têm dois handlers concorrentes no Composer.
 *
 * Com o foco no textarea do chat, Ctrl/Cmd+F era tratado DUAS vezes — no próprio composer
 * (useChatPanelHandlers) e no listener de window do ChatPanel: dois toggles devolviam o
 * painel de busca ao estado anterior, então a busca simplesmente não abria. Ctrl+K abria o
 * diálogo de busca do composer E a busca global da Inbox (listener de document montado pelo
 * RealtimeInboxView), deixando um segundo painel na tela.
 *
 * Prova: renderizamos o ChatPanel REAL, com o textarea real (ChatInputArea), a barra de busca
 * real (ChatSearchBar) e o hook real de handlers; o listener global de Ctrl+K é o MESMO hook
 * que o RealtimeInboxView monta (`useGlobalSearchShortcut`). Um pressionamento com o foco no
 * textarea tem de produzir UMA única ação; com o foco fora dele, o listener global continua
 * dono do atalho e nada é consumido.
 */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGlobalSearchShortcut } from '@/hooks/ui/useGlobalSearchShortcut';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  logStub: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const vazio = { select: () => ({ limit: async () => ({ data: [], error: null }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
  return {
    supabase: {
      rpc: () => vazio,
      from: () => ({ update: () => ({ eq: () => ({ error: null }) }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: null }), remove: vi.fn() }) },
    },
  };
});

vi.mock('@/lib/logger', () => ({
  log: mocks.logStub,
  logger: mocks.logStub,
  getLogger: () => mocks.logStub,
  generateCorrelationId: () => 'corr-test',
  getSessionId: () => 'sessao-test',
  logPerformance: (_l: string, fn: () => void) => fn(),
  logAsyncPerformance: async (_l: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({ isContactTyping: false, typingUsers: [], handleTypingStart: vi.fn(), handleTypingStop: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => ({ editMessage: vi.fn() }) }));

vi.mock('@/hooks/chat/useQuickReplies', () => ({ useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }) }));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false, currentMessageId: null,
    voiceId: '', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({ useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }) }));

vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));

vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: (t: string) => t }),
}));

vi.mock('../useChatMediaSending', () => ({
  useChatMediaSending: () => ({ instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(), handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn() }),
}));

// Hooks de dados do composer que exigem contexto de query fora do escopo deste cartão:
// estão mockados no mesmo contrato consumido por useChatPanelHandlers (não são o caminho sob prova).
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({ isFavorite: () => false, favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), snoozeConversation: vi.fn() }),
}));

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: async () => null }),
  tomorrowAtNine: () => new Date(),
}));

vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));

vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

// Componentes pesados que não participam do caminho do atalho.
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));

// Busca global do diálogo do composer: marcador observável em vez do painel real.
vi.mock('../GlobalSearch', () => ({
  GlobalSearch: ({ open }: { open?: boolean }) => (open ? <div data-testid="busca-global-do-composer" /> : null),
}));

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
  assignedTo: { name: 'Agente' },
} as unknown as Conversation;

/** Mesmo listener global que o RealtimeInboxView monta (src/components/inbox/RealtimeInboxView.tsx:151). */
function BuscaGlobalDaInbox() {
  const [aberturas, setAberturas] = useState(0);
  useGlobalSearchShortcut({ onOpen: () => setAberturas((n) => n + 1) });
  return <span data-testid="aberturas-busca-global">{aberturas}</span>;
}

function renderPainel() {
  return render(
    <TooltipProvider>
      <BuscaGlobalDaInbox />
      <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />
    </TooltipProvider>,
  );
}

function textarea() {
  return screen.getByLabelText('Digite sua mensagem') as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatPanel — atalhos de busca do composer (R2-INB-017)', () => {
  it('Ctrl+F com o foco no textarea abre a busca da conversa (um único toggle)', async () => {
    renderPainel();
    textarea().focus();

    fireEvent.keyDown(textarea(), { key: 'f', ctrlKey: true });

    // Antes da correção os dois handlers se cancelavam e a barra de busca não aparecia.
    expect(await screen.findByPlaceholderText('Buscar na conversa...')).toBeInTheDocument();
  });

  it('repetir Ctrl+F com o foco no textarea fecha a busca (resultado previsível)', async () => {
    renderPainel();
    textarea().focus();

    fireEvent.keyDown(textarea(), { key: 'f', ctrlKey: true });
    const barra = await screen.findByPlaceholderText('Buscar na conversa...');

    fireEvent.keyDown(textarea(), { key: 'f', ctrlKey: true });

    await waitForElementToBeRemoved(barra);
  });

  it('Ctrl+K com o foco no textarea abre apenas a busca do composer', async () => {
    renderPainel();
    textarea().focus();

    fireEvent.keyDown(textarea(), { key: 'k', ctrlKey: true });

    expect(await screen.findByTestId('busca-global-do-composer')).toBeInTheDocument();
    // O listener de document (busca global da Inbox) não pode agir no mesmo pressionamento.
    await waitFor(() => expect(screen.getByTestId('aberturas-busca-global')).toHaveTextContent('0'));
  });

  it('Ctrl+K fora do textarea continua sendo do listener global da Inbox', async () => {
    renderPainel();
    document.body.focus();

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

    await waitFor(() => expect(screen.getByTestId('aberturas-busca-global')).toHaveTextContent('1'));
    expect(screen.queryByTestId('busca-global-do-composer')).not.toBeInTheDocument();
  });

  it('Ctrl+F fora do textarea abre a busca da conversa pelo listener de window', async () => {
    renderPainel();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    });

    expect(await screen.findByPlaceholderText('Buscar na conversa...')).toBeInTheDocument();
  });
});
