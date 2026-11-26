import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Message, Conversation } from '@/types/chat';
import { toast } from 'sonner';

// R2-INB-021 (item 317): o menu do balão e o menu do header exibiam itens que
// anunciavam uma ação e não concluíam nada (Favoritar/Fixar/Responder depois/
// Reportar no balão; "Adicionar tag" no header). No header a regra segue de pé:
// "Adicionar tag" continua fora. No balão as quatro voltaram porque as tabelas,
// RPCs e hooks passaram a existir — e aqui se prova que cada uma chega à
// operação declarada, junto com as entradas que já existiam.

const mocks = vi.hoisted(() => ({
  updateEq: vi.fn(),
  deleteMessage: vi.fn(),
  markMessageAsRead: vi.fn(),
  markMessageAsUnread: vi.fn(),
  useApplicableSLA: vi.fn(),
  toggleFavorite: vi.fn(),
  pin: vi.fn(),
  unpin: vi.fn(),
  remind: vi.fn(),
  report: vi.fn(),
}));

vi.mock('@/hooks/crm/useExternalContact360', () => ({
  // Mesmo padrao de ContactHeaderSection.test.tsx:8-10: o hook real desce ate
  // useAuth e exigiria AuthProvider. Com data null o CrmBadges nao renderiza
  // selo nenhum, entao as assercoes deste arquivo seguem intactas.
  useExternalContact360: () => ({ data: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: (...args: unknown[]) => {
          const resultado = Promise.resolve(mocks.updateEq(...args));
          // "Marcar como não lida" confirma as linhas gravadas com `.select('id')`.
          return Object.assign(resultado, {
            select: () => resultado.then((r: { error?: unknown } | undefined) =>
              ({ data: r?.error ? null : [{ id: args[1] }], error: r?.error ?? null })),
          });
        },
      }),
      // Última mensagem do cliente (alvo do "não lida" quando a bolha é nossa).
      select: () => {
        const b = { eq: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: { id: 'm-in-1' }, error: null }) };
        return b;
      },
    }),
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    deleteMessage: mocks.deleteMessage,
    markMessageAsRead: mocks.markMessageAsRead,
    markMessageAsUnread: mocks.markMessageAsUnread,
    isLoading: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

vi.mock('@/components/inbox/TextToSpeechButton', () => ({
  TextToSpeechButton: () => null,
}));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: mocks.useApplicableSLA }));
vi.mock('@/components/inbox/SLAIndicator', () => ({
  SLAIndicator: () => <div data-testid="sla-indicator" />,
}));
vi.mock('@/components/inbox/VoiceSelector', () => ({ VoiceSelector: () => null }));
vi.mock('@/components/inbox/SpeedSelector', () => ({ SpeedSelector: () => null }));
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));
vi.mock('@/components/inbox/contact-details/AnalysisBadges', () => ({ AnalysisBadges: () => null }));
vi.mock('@/components/inbox/contact-details/BusinessHoursBadge', () => ({ BusinessHoursBadge: () => null }));

// As operações por mensagem são reais (tabelas + RPCs); aqui se prova que o menu
// as alcança. Os hooks são espiões para a asserção ser sobre o id da mensagem
// clicada, sem QueryClientProvider nem consulta ao banco.
vi.mock('@/hooks/chat/useMessageFavorites', () => ({
  useMessageFavorites: () => ({ favoriteIds: new Set<string>(), isLoading: false, isFavorite: () => false, refetch: vi.fn() }),
  useToggleMessageFavorite: () => ({ toggleFavorite: mocks.toggleFavorite, isToggling: false }),
}));

vi.mock('@/hooks/chat/useMessagePins', () => ({
  PIN_LIMIT: 3,
  useMessagePins: () => ({
    pins: [],
    isLoading: false,
    isPinned: () => false,
    pin: mocks.pin,
    unpin: mocks.unpin,
    isPinning: false,
    isUnpinning: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/chat/useRemindMessage', () => ({
  useRemindMessage: () => ({ remind: mocks.remind, isSaving: false }),
}));

vi.mock('@/hooks/chat/useReportMessage', () => ({
  useReportMessage: () => ({
    report: mocks.report,
    isReported: () => false,
    reportedIds: new Set<string>(),
    isLoading: false,
    isReporting: false,
    refetch: vi.fn(),
  }),
}));

// Radix DropdownMenu não abre de forma confiável sob jsdom+fireEvent — mock
// simples que renderiza o conteúdo sempre "aberto" (mesmo padrão de
// ChatPanelHeader.test.tsx e MessageHoverToolbar.delete.test.tsx).
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="menu-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const makeMessage = (over: Partial<Message> = {}): Message => ({
  id: 'm-1',
  content: 'olá',
  sender: 'agent',
  timestamp: new Date(),
  type: 'text',
  external_id: 'ext-1',
  contact_id: 'c-1',
  ...over,
} as Message);

function renderToolbar(message: Message, handlers: { onMessageDeleted?: (id: string) => void } = {}) {
  const onMessageDeleted = handlers.onMessageDeleted ?? vi.fn();
  render(
    <MessageHoverToolbar
      message={message}
      isSent
      instanceName="inst-1"
      contactJid="5511999999999@s.whatsapp.net"
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onMessageDeleted={onMessageDeleted}
    />
  );
  return onMessageDeleted;
}

const mockConversation = {
  id: 'conv-1',
  contact: { id: 'c-1', name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  channel: 'whatsapp',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Conversation;

const headerProps = {
  conversation: mockConversation,
  isContactTyping: false,
  showAIAssistant: false,
  showDetails: false,
  voiceId: 'voice-1',
  speed: 1,
  onToggleAIAssistant: vi.fn(),
  onToggleDetails: vi.fn(),
  onStartCall: vi.fn(),
  onOpenSearch: vi.fn(),
  onOpenTransfer: vi.fn(),
  onOpenSchedule: vi.fn(),
  onVoiceChange: vi.fn(),
  onSpeedChange: vi.fn(),
  onCloseConversation: vi.fn(),
  onArchive: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMessage.mockResolvedValue(undefined);
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.markMessageAsRead.mockResolvedValue(undefined);
  mocks.markMessageAsUnread.mockResolvedValue(undefined);
  mocks.useApplicableSLA.mockReturnValue({ data: null, isLoading: false });
  mocks.toggleFavorite.mockResolvedValue(true);
  mocks.pin.mockResolvedValue(undefined);
  mocks.unpin.mockResolvedValue(undefined);
  mocks.remind.mockResolvedValue('task-1');
  mocks.report.mockResolvedValue('report-1');
});

describe('menu do balão — R2-INB-021', () => {
  it('volta a oferecer as quatro ações agora que a operação existe', () => {
    renderToolbar(makeMessage());

    for (const viva of [
      'Favoritar mensagem',
      'Fixar mensagem (máx. 3)',
      'Responder depois',
      'Em 1 hora',
      'Amanhã às 9h',
      'Em 3 dias às 9h',
      'Denunciar mensagem',
      'Spam',
      'Conteúdo impróprio',
      'Urgência',
      'Outro motivo',
    ]) {
      expect(screen.getByText(viva)).toBeTruthy();
    }
  });

  it('denunciar também aparece no balão de mensagem recebida', () => {
    render(
      <MessageHoverToolbar
        message={makeMessage({ sender: 'contact' })}
        isSent={false}
        instanceName="inst-1"
        contactJid="5511999999999@s.whatsapp.net"
        ttsLoading={false}
        ttsPlaying={false}
        ttsMessageId={null}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onCopy={vi.fn()}
        onSpeak={vi.fn()}
        onStop={vi.fn()}
        onMessageDeleted={vi.fn()}
      />
    );

    expect(screen.getByText('Denunciar mensagem')).toBeTruthy();
    expect(screen.getByText('Favoritar mensagem')).toBeTruthy();
  });

  it('cada ação por mensagem chega à operação declarada', async () => {
    renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Favoritar mensagem'));
    await waitFor(() => expect(mocks.toggleFavorite).toHaveBeenCalledWith('m-1'));

    fireEvent.click(screen.getByText('Fixar mensagem (máx. 3)'));
    await waitFor(() => expect(mocks.pin).toHaveBeenCalledWith('m-1'));
    expect(mocks.unpin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Em 1 hora'));
    await waitFor(() => expect(mocks.remind).toHaveBeenCalledTimes(1));
    const [idLembrete, quando] = mocks.remind.mock.calls[0] as [string, Date];
    expect(idLembrete).toBe('m-1');
    expect(quando.getTime()).toBeGreaterThan(Date.now());

    fireEvent.click(screen.getByText('Conteúdo impróprio'));
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith('m-1', 'improprio'));
  });

  it('cada ação que sobrou no menu conclui a operação declarada', async () => {
    const onMessageDeleted = renderToolbar(makeMessage());

    fireEvent.click(screen.getByText('Marcar como lida'));
    await waitFor(() =>
      expect(mocks.markMessageAsRead).toHaveBeenCalledWith('inst-1', {
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: true,
        id: 'ext-1',
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Marcada como lida');

    fireEvent.click(screen.getByText('Marcar como não lida'));
    await waitFor(() => expect(mocks.markMessageAsUnread).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Apagar para todos'));
    await waitFor(() => expect(onMessageDeleted).toHaveBeenCalledWith('m-1'));
    expect(toast.success).toHaveBeenCalledWith('Mensagem deletada para todos');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('menu do header — R2-INB-021', () => {
  it('não oferece mais "Adicionar tag" sem ação', () => {
    render(<ChatPanelHeader {...headerProps} />);

    expect(screen.queryByText('Adicionar tag')).toBeNull();
  });

  it('cada ação que sobrou no menu do header chega ao seu handler', () => {
    render(<ChatPanelHeader {...headerProps} />);

    fireEvent.click(screen.getByText('Transferir'));
    expect(headerProps.onOpenTransfer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Agendar mensagem'));
    expect(headerProps.onOpenSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Arquivar'));
    expect(headerProps.onArchive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Encerrar Conversa'));
    expect(headerProps.onCloseConversation).toHaveBeenCalledTimes(1);
  });
});
