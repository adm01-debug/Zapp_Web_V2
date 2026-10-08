import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Conversation } from '@/types/chat';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter } from 'react-router-dom';

// R2-SLA-003: o cabeçalho deve resolver o prazo granular de primeira resposta
// pelo hook useApplicableSLA (fonte única da hierarquia), em vez do literal 5.
const mocks = vi.hoisted(() => ({ useApplicableSLA: vi.fn() }));

vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: mocks.useApplicableSLA }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/components/inbox/SLAIndicator', () => ({
  SLAIndicator: ({ firstResponseMinutes }: { firstResponseMinutes?: number }) => (
    <div
      data-testid="sla-indicator"
      data-minutes={firstResponseMinutes === undefined ? '' : String(firstResponseMinutes)}
    />
  ),
}));
vi.mock('@/components/inbox/VoiceSelector', () => ({ VoiceSelector: () => null }));
vi.mock('@/components/inbox/SpeedSelector', () => ({ SpeedSelector: () => null }));
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));

// Radix DropdownMenu/Popover não abrem de forma confiável sob jsdom+fireEvent
// (mesmo padrão usado em EmailChatReplyBar.test.tsx) — mock simples que
// renderiza o conteúdo sempre "aberto" para testar os itens do menu.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockConversation = {
  id: 'conv-1',
  contact: {
    id: 'c-1',
    name: 'Maria Silva',
    phone: '+551****9999',
    avatar: '',
  },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  channel: 'whatsapp',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Conversation;

/** Conversa com todos os atributos que o resolvedor de SLA sabe usar. */
const granularConversation = {
  ...mockConversation,
  contact: {
    ...mockConversation.contact,
    company: 'Promo Brindes',
    job_title: 'Comprador',
    contact_type: 'lead',
    queue_id: 'q-legacy',
  },
  queue: { id: 'q-1', name: 'Comercial' },
  assignedTo: { id: 'agent-1', name: 'Ana Souza' },
} as unknown as Conversation;

const baseProps = {
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
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </BrowserRouter>
);

describe('ChatPanelHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prazo aplicável granular: 2 min (não o literal 5 de antes).
    mocks.useApplicableSLA.mockReturnValue({
      data: { firstResponseMinutes: 2, resolutionMinutes: 30, ruleName: 'Granular', ruleId: 'r-1' },
      isLoading: false,
    });
  });

  it('renders contact name', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('renders avatar fallback initials', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  // ── R2-INB-030 ────────────────────────────────────────────────────────────
  // Antes: o header mostrava o rótulo verde "Online" sempre que o contato NÃO
  // estava digitando, e o selo verde sobre o avatar era incondicional — nenhum
  // sinal de presença participava da decisão. Agora, sem sinal de presença do
  // contato, o header exibe o estado neutro (desconhecido) e nunca afirma Online.

  it('R2-INB-030: sem sinal de presença, não afirma Online e mostra estado neutro', () => {
    const { container } = render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} isContactTyping={false} />
      </Wrapper>
    );
    // Não estar digitando não é sinal de presença online.
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    // O que fica no lugar é o estado desconhecido/neutro, nomeado para o leitor de tela.
    expect(screen.getByTestId('contact-presence')).toHaveAttribute(
      'aria-label',
      'Presença do contato não informada'
    );
    // O selo verde de "online" sobre o avatar sai junto (era renderizado sem sinal).
    expect(container.querySelector('.bg-\\[hsl\\(var\\(--online\\)\\)\\]')).toBeNull();
  });

  it('R2-INB-030: digitando, mostra o indicador de digitação e nenhuma afirmação de presença', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} isContactTyping={true} />
      </Wrapper>
    );
    expect(screen.getByText('digitando')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.queryByTestId('contact-presence')).not.toBeInTheDocument();
  });

  it('renders only the Mais ações button in the header (Ligar/Vídeo/Adicionar participante moved to contact sidebar)', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    expect(screen.queryByLabelText('Ligar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Videochamada')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adicionar participante')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mais ações')).toBeInTheDocument();
  });

  it('does NOT render summary item in the menu when onGenerateSummary is undefined', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    expect(screen.queryByText(/resumo da conversa/i)).not.toBeInTheDocument();
  });

  it('renders summary menu item when handler is provided', () => {
    const onGenerate = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} onGenerateSummary={onGenerate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    expect(screen.getByText(/resumo da conversa/i)).toBeInTheDocument();
  });

  it('calls onGenerateSummary when the menu item is clicked', () => {
    const onGenerate = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} canGenerateSummary={true} onGenerateSummary={onGenerate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    fireEvent.click(screen.getByText(/resumo da conversa/i));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSearch when the "Buscar na conversa" menu item is clicked', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Mais ações'));
    fireEvent.click(screen.getByText(/buscar na conversa/i));
    expect(baseProps.onOpenSearch).toHaveBeenCalledTimes(1);
  });

  const pinned = [
    { id: 'c-2', name: 'Marilia Jomed', avatarUrl: null },
    { id: 'c-3', name: 'Rodrigo Maciel', avatarUrl: null },
  ];

  it('renders pinned faces and opens the conversation on click when details are closed', () => {
    const onSelectPinned = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} showDetails={false} pinnedConversations={pinned} onSelectPinned={onSelectPinned} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Abrir conversa fixada com Rodrigo Maciel'));
    expect(onSelectPinned).toHaveBeenCalledWith('c-3');
  });

  it('hides pinned faces when the contact details panel is open', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} showDetails={true} pinnedConversations={pinned} onSelectPinned={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByLabelText('Abrir conversa fixada com Rodrigo Maciel')).not.toBeInTheDocument();
  });

  it('renders the favorite star and calls onToggleFavorite when clicked', () => {
    const onToggleFavorite = vi.fn();
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} isFavorite={false} onToggleFavorite={onToggleFavorite} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Favoritar conversa'));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  // ── R2-SLA-003 ────────────────────────────────────────────────────────────

  it('R2-SLA-003: repassa ao SLAIndicator o prazo aplicável granular (2 min), não o literal 5', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} conversation={granularConversation} />
      </Wrapper>
    );
    expect(screen.getByTestId('sla-indicator')).toHaveAttribute('data-minutes', '2');
  });

  it('R2-SLA-003: envia ao resolvedor os identificadores disponíveis da conversa', () => {
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} conversation={granularConversation} />
      </Wrapper>
    );
    expect(mocks.useApplicableSLA).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'c-1',
        company: 'Promo Brindes',
        jobTitle: 'Comprador',
        contactType: 'lead',
        queueId: 'q-1',
        agentId: 'agent-1',
      })
    );
  });

  it('R2-SLA-003: usa o padrão seguro enquanto o prazo aplicável ainda não chegou', () => {
    mocks.useApplicableSLA.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <Wrapper>
        <ChatPanelHeader {...baseProps} conversation={granularConversation} />
      </Wrapper>
    );
    expect(screen.getByTestId('sla-indicator')).toHaveAttribute('data-minutes', '5');
  });
});
