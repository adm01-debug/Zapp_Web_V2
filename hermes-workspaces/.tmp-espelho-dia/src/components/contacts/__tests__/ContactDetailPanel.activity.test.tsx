/**
 * #253 (R2-AUTH-028) — o painel de detalhe do contato mostrava "0 Mensagens" e
 * "Inativo"/"—" porque recebia `messageCount`/`lastMessageAt` por props que o
 * único consumidor de produção (`ContactsView`) nunca fornecia.
 *
 * Aqui o painel REAL é renderizado e prova, contra o serviço (mockado na borda
 * de dados), que ele passa a:
 *  - buscar a atividade canônica do contato (nº de mensagens + última);
 *  - mostrar a contagem/data reais quando a consulta responde;
 *  - distinguir zero confirmado de carregando e de indisponível — sem inventar
 *    "0"/"Inativo" quando os insumos não são conhecidos.
 *
 * O mock é na camada de SERVIÇO (`ContactService`), não no hook: o
 * `useContactActivity` do painel roda de verdade.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPanel } from '../ContactDetailPanel';

const { fetchStatsMock, lastDatesMock } = vi.hoisted(() => ({
  fetchStatsMock: vi.fn(),
  lastDatesMock: vi.fn(),
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: fetchStatsMock,
    getLastMessageDates: lastDatesMock,
  },
}));

// Filhos que falam direto com a rede / animações pesadas: fora do escopo aqui.
vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div data-testid="timeline" /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div data-testid="purchases" /> }));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger}</div>,
}));

// Captura o que o painel entrega ao score de engajamento (o valor que era 0 fixo).
vi.mock('../ContactEngagementScore', () => ({
  ContactEngagementScore: ({ messageCount, lastMessageAt }: { messageCount: number; lastMessageAt?: string | null }) => (
    <div
      data-testid="engagement-score"
      data-message-count={String(messageCount)}
      data-last-message-at={lastMessageAt ?? ''}
    />
  ),
}));

const CONTACT = {
  id: 'c1',
  name: 'Maria Silva',
  phone: '5541999990000',
  created_at: '2026-01-01T00:00:00Z',
};

const STATS = {
  totalMessages: 150,
  avgResponseTimeMinutes: 45,
  totalConversations: 12,
  messagesChangePercent: null,
  conversationsChangePercent: null,
  csatAverage: null,
  csatCount: 0,
};

function renderPanel(contact: typeof CONTACT = CONTACT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactDetailPanel
        contact={contact}
        onClose={vi.fn()}
        onOpenChat={vi.fn()}
        onEdit={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchStatsMock.mockReset();
  lastDatesMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('#253 — atividade do contato no painel de detalhe', () => {
  it('contato com mensagens: mostra a contagem e a última mensagem REAIS, não zero', async () => {
    fetchStatsMock.mockResolvedValue(STATS);
    lastDatesMock.mockResolvedValue({
      data: [{ contact_id: 'c1', last_message_at: '2026-10-01T12:00:00Z' }],
      error: null,
    });

    renderPanel();

    await screen.findByTestId('activity-message-count');

    expect(screen.getByTestId('activity-summary')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('activity-message-count')).toHaveTextContent('150');
    expect(screen.getByTestId('activity-last-message')).toHaveTextContent('01/10');

    const score = screen.getByTestId('engagement-score');
    expect(score).toHaveAttribute('data-message-count', '150');
    expect(score).toHaveAttribute('data-last-message-at', '2026-10-01T12:00:00Z');
  });

  it('contato sem nenhuma mensagem: zero CONFIRMADO (0 e "—") e score calculado', async () => {
    fetchStatsMock.mockResolvedValue({ ...STATS, totalMessages: 0 });
    lastDatesMock.mockResolvedValue({ data: [], error: null });

    renderPanel();

    await screen.findByTestId('activity-message-count');

    expect(screen.getByTestId('activity-summary')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('activity-message-count')).toHaveTextContent('0');
    expect(screen.getByTestId('activity-last-message')).toHaveTextContent('—');

    const score = screen.getByTestId('engagement-score');
    expect(score).toHaveAttribute('data-message-count', '0');
  });

  it('consulta da contagem com erro: não afirma "0"/"Inativo" — marca indisponível', async () => {
    fetchStatsMock.mockRejectedValue(new Error('falha de rede'));
    lastDatesMock.mockResolvedValue({ data: [], error: null });

    renderPanel();

    await screen.findByTestId('engagement-unavailable');

    expect(screen.getByTestId('activity-summary')).toHaveAttribute('data-state', 'unavailable');
    expect(screen.getByTestId('activity-message-count')).toHaveTextContent('—');
    expect(screen.queryByTestId('engagement-score')).not.toBeInTheDocument();
  });

  it('consulta da última mensagem com erro (RPC) também vira indisponível', async () => {
    fetchStatsMock.mockResolvedValue(STATS);
    lastDatesMock.mockResolvedValue({ data: null, error: new Error('rpc falhou') });

    renderPanel();

    await screen.findByTestId('engagement-unavailable');

    expect(screen.getByTestId('activity-summary')).toHaveAttribute('data-state', 'unavailable');
    expect(screen.queryByTestId('engagement-score')).not.toBeInTheDocument();
  });

  it('enquanto carrega: estado de carregamento, sem afirmar zero nem engajamento', () => {
    fetchStatsMock.mockReturnValue(new Promise(() => {}));
    lastDatesMock.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.getByTestId('activity-summary')).toHaveAttribute('data-state', 'loading');
    expect(screen.getByTestId('activity-count-loading')).toBeInTheDocument();
    expect(screen.getByTestId('engagement-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-message-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('engagement-score')).not.toBeInTheDocument();
  });
});
