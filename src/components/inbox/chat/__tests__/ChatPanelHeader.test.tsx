import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import type { Conversation } from '@/types/chat';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatPanelHeader } from '../ChatPanelHeader';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/components/inbox/SLAIndicator', () => ({ SLAIndicator: () => null }));

const mockConversation = {
  id: 'conv-1',
  contact: {
    id: 'c-1',
    name: 'Maria Silva',
    phone: '+5511999999999',
    avatar: '',
    contact_type: 'cliente',
    conversation_status: 'open',
    tags: ['vip'],
  },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'high',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
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

function renderHeader(overrides: Partial<ComponentProps<typeof ChatPanelHeader>> = {}) {
  return render(
    <BrowserRouter>
      <TooltipProvider>
        <ChatPanelHeader {...baseProps} {...overrides} />
      </TooltipProvider>
    </BrowserRouter>,
  );
}

function openActionsMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações da conversa' }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('ChatPanelHeader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza identidade e chips apenas a partir dos dados reais', () => {
    const { container } = renderHeader();

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('MS')).toBeInTheDocument();
    expect(screen.getByText('Em atendimento')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Alta prioridade')).toBeInTheDocument();
    expect(container.querySelector('header')).toHaveClass('h-[72px]');
  });

  it('mantém exatamente quatro ações primárias de 40px', () => {
    renderHeader();
    const primaryActions = [
      screen.getByRole('button', { name: 'Ligar' }),
      screen.getByRole('button', { name: 'Transferir conversa' }),
      screen.getByRole('button', { name: 'Detalhes do contato' }),
      screen.getByRole('button', { name: 'Mais ações da conversa' }),
    ];

    expect(primaryActions).toHaveLength(4);
    primaryActions.forEach((button) => expect(button).toHaveClass('h-10', 'w-10'));
  });

  it('alterna o favorito somente quando há handler real', () => {
    const onToggleFavorite = vi.fn();
    renderHeader({ onToggleFavorite, isFavorite: true });

    const button = screen.getByRole('button', { name: 'Remover contato dos favoritos' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });

  it('move busca e resumo para o menu sem perder seus handlers', async () => {
    const onGenerateSummary = vi.fn();
    renderHeader({ onGenerateSummary });
    openActionsMenu();

    fireEvent.click(await screen.findByRole('menuitem', { name: /buscar na conversa/i }));
    expect(baseProps.onOpenSearch).toHaveBeenCalledOnce();

    openActionsMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /resumo da conversa/i }));
    expect(onGenerateSummary).toHaveBeenCalledOnce();
  });

  it('desabilita o resumo enquanto ele está sendo gerado', async () => {
    renderHeader({ onGenerateSummary: vi.fn(), isSummaryLoading: true });
    openActionsMenu();

    expect(await screen.findByRole('menuitem', { name: /resumo da conversa/i })).toHaveAttribute('data-disabled');
  });
});
