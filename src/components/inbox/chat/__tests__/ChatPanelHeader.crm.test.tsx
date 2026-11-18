import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanelHeader } from '../ChatPanelHeader';
import { Conversation } from '@/types/chat';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter } from 'react-router-dom';

// Prova que os selos de CRM estão de fato LIGADOS no cabeçalho, e não só que o
// componente CrmBadges funciona isolado. Separado de ChatPanelHeader.test.tsx
// porque lá o hook é mockado com `data: null` para o arquivo inteiro.
const crm360 = {
  found: true,
  company: { nome_fantasia: 'Aquarella Print', nome_crm: 'AQUARELLA PRINT LTDA' },
  customer: {
    vendedor_nome: 'Maria Aparecida de Souza',
    total_pedidos: 12,
    ticket_medio: 1850.5,
    valor_total_compras: 22206,
    cliente_ativado: true,
  },
  rfm: { segment_code: 'Champions' },
};

vi.mock('@/hooks/sla/useApplicableSLA', () => ({ useApplicableSLA: () => ({ data: null }) }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/popupManager', () => ({ openChatPopup: vi.fn() }));
vi.mock('@/components/inbox/SLAIndicator', () => ({ SLAIndicator: () => null }));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));

const mocks = vi.hoisted(() => ({ useExternalContact360: vi.fn() }));
vi.mock('@/hooks/crm/useExternalContact360', () => ({
  useExternalContact360: mocks.useExternalContact360,
}));

const conversa = {
  id: 'conv-1',
  contact: { id: 'c-1', name: 'Maria Silva', phone: '+551****9999', avatar: '' },
  lastMessage: { content: 'Olá', timestamp: new Date(), sender: 'contact' },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  channel: 'whatsapp',
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Conversation;

// Mesmo conjunto de props de ChatPanelHeader.test.tsx:84-99.
const baseProps = {
  conversation: conversa,
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

const montar = (crm?: unknown) => {
  mocks.useExternalContact360.mockReturnValue({ data: crm });
  return render(
    <BrowserRouter>
      <TooltipProvider>
        <ChatPanelHeader {...baseProps} />
      </TooltipProvider>
    </BrowserRouter>,
  );
};

describe('ChatPanelHeader: selos do CRM', () => {
  it('mostra empresa, vendedor, segmento e situacao quando o CRM tem o contato', () => {
    montar(crm360);

    expect(screen.getByText('Aquarella Print')).toBeTruthy();
    expect(screen.getByText('Maria Aparecida')).toBeTruthy();
    expect(screen.getByText('Champions')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('contato que o CRM nao achou nao mostra selo nenhum', () => {
    // found=false: o CRM respondeu, mas sobre outro telefone. Mostrar os campos
    // vazios como se fossem do contato seria pior do que nao mostrar nada.
    montar({ ...crm360, found: false });

    expect(screen.queryByText('Aquarella Print')).toBeNull();
    expect(screen.queryByText('Champions')).toBeNull();
    expect(screen.queryByText('Ativo')).toBeNull();
    // O cabeçalho em si continua de pé.
    expect(screen.getByText('Maria Silva')).toBeTruthy();
  });

  it('integracao de CRM desligada nao quebra o cabecalho', () => {
    // Com a integração desligada o hook nem consulta e devolve data undefined.
    montar(undefined);

    expect(screen.getByText('Maria Silva')).toBeTruthy();
    expect(screen.queryByText('Champions')).toBeNull();
  });
});
