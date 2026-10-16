/**
 * C02 (t_1d36d214) — o "Ligar" do cabeçalho do chat emite o pedido de chamada
 * de saída do inbox, com os dados do contato da conversa aberta.
 *
 * Prova de comportamento: o ChatPanel real é renderizado com o contrato REAL
 * de eventos (`@/lib/calls/events` não é mockado) — o clique dispara de verdade
 * o `zapp:start-call` no document, o mesmo evento que o CallSessionProvider
 * assina. O cabeçalho é dublado por um botão que invoca a prop `onStartCall`
 * (o cabeçalho só repassa a prop; quem emite é o ChatPanel — ver divergência
 * registrada em click-to-call-origens.test.ts).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
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

vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({ isFavorite: () => false, favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), snoozeConversation: vi.fn() }),
}));

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: async () => null }),
  tomorrowAtNine: () => new Date(),
}));

vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));

// Cabeçalho dublado por um gatilho da prop real — o ChatPanelHeader de
// produção só repassa `onStartCall` para o botão "Ligar" dele.
vi.mock('../chat/ChatPanelHeader', () => ({
  ChatPanelHeader: ({ onStartCall }: { onStartCall?: () => void }) => (
    <button data-testid="ligar-do-cabecalho" onClick={onStartCall}>Ligar</button>
  ),
}));

// Componentes pesados que não participam do caminho do "Ligar".
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ GlobalSearch: () => null }));

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+5511999999999', avatar: 'https://cdn.exemplo/maria.png' },
  assignedTo: { name: 'Agente' },
} as unknown as Conversation;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatPanel — "Ligar" do cabeçalho (C02)', () => {
  it('emite zapp:start-call real com phone, nome, avatar e source inbox', () => {
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(
        <TooltipProvider>
          <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={vi.fn()} />
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByTestId('ligar-do-cabecalho'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toEqual({
        channel: 'voip',
        phone: '+5511999999999',
        contactId: 'contato-1',
        name: 'Maria Silva',
        avatar: 'https://cdn.exemplo/maria.png',
        source: 'inbox',
      });
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });

  it('sem avatar no contato, o payload sai sem o campo (o cartão usa o fallback)', () => {
    const semAvatar = {
      ...conversation,
      contact: { id: 'contato-2', name: 'Sem Foto', phone: '+5511888888888' },
    } as unknown as Conversation;
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(
        <TooltipProvider>
          <ChatPanel conversation={semAvatar} messages={[] as Message[]} onSendMessage={vi.fn()} />
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByTestId('ligar-do-cabecalho'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      const detail = (ouvido.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toMatchObject({ phone: '+5511888888888', name: 'Sem Foto', source: 'inbox' });
      expect(detail.avatar).toBeUndefined();
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });
});
