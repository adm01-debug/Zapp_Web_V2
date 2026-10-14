/**
 * Base de Conhecimento -> rascunho (t_9bb1649b, ponto 1 do refazer): o ChatPanel,
 * dono do rascunho, registra o escritor na ponte `composerInsert` REAL (o módulo
 * não é mockado aqui). `requestComposerInsert` coloca o trecho no rascunho sem
 * enviar nada; ao desmontar, o registro cai e o pedido é recusado em vez de
 * falhar calado. O input é dublado por um textarea que observa `inputValue`
 * (o estado do rascunho é real; só a renderização do ChatInputArea é dublada).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEventHandler } from 'react';
import { ChatPanel } from '../ChatPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registerComposerInsert, requestComposerInsert } from '../contact-details/composerInsert';
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

vi.mock('../chat/ChatPanelHeader', () => ({
  ChatPanelHeader: () => null,
}));

// Componentes pesados que não participam do caminho base -> rascunho.
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

// O input dublado observa o `inputValue` real: o estado do rascunho é do
// ChatPanel de produção, só a renderização é simplificada.
vi.mock('../chat/ChatInputArea', () => ({
  ChatInputArea: ({ inputValue, onInputChange }: { inputValue: string; onInputChange: ChangeEventHandler<HTMLTextAreaElement> }) => (
    <textarea data-testid="rascunho" value={inputValue} onChange={onInputChange} />
  ),
}));

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+551****9999', avatar: 'https://cdn.exemplo/maria.png' },
  assignedTo: { name: 'Agente' },
} as unknown as Conversation;

function renderPainel(onSendMessage = vi.fn()) {
  return render(
    <TooltipProvider>
      <ChatPanel conversation={conversation} messages={[] as Message[]} onSendMessage={onSendMessage} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  registerComposerInsert(null);
});

describe('ChatPanel — escritor do rascunho para a base de conhecimento', () => {
  it('coloca o trecho da base no rascunho sem enviar nada', () => {
    const onSendMessage = vi.fn();
    renderPainel(onSendMessage);

    let ok = false;
    act(() => { ok = requestComposerInsert('Prazo de entrega: 7 dias úteis.'); });
    expect(ok).toBe(true);
    expect(screen.getByTestId('rascunho')).toHaveValue('Prazo de entrega: 7 dias úteis.');
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('anexa ao rascunho existente em vez de substituir', () => {
    renderPainel();
    fireEvent.change(screen.getByTestId('rascunho'), { target: { value: 'Olá, Maria!' } });

    let ok = false;
    act(() => { ok = requestComposerInsert('Prazo de entrega: 7 dias úteis.'); });
    expect(ok).toBe(true);
    expect(screen.getByTestId('rascunho')).toHaveValue('Olá, Maria!\n\nPrazo de entrega: 7 dias úteis.');
  });

  it('ao desmontar solta o registro: o pedido é recusado sem throw', () => {
    const { unmount } = renderPainel();
    unmount();

    expect(requestComposerInsert('Prazo de entrega: 7 dias úteis.')).toBe(false);
  });
});
