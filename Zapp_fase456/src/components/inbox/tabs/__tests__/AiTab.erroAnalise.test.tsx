import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AiTab } from '../AiTab';
import type { Conversation } from '@/types/chat';

/**
 * t_1944d290 — a falha de leitura da análise aparecia como "Sem análise ainda":
 * o atendente lia que o contato nunca foi analisado quando a leitura falhou.
 */
const mockUseLatestAnalysis = vi.fn();
const mockUseNextBestAction = vi.fn();
const mockUseContactLeadScore = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/hooks/chat/useLatestAnalysis', () => ({
  useLatestAnalysis: (...args: unknown[]) => mockUseLatestAnalysis(...args),
}));
vi.mock('@/hooks/chat/useNextBestAction', () => ({
  useNextBestAction: (...args: unknown[]) => mockUseNextBestAction(...args),
}));
vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactLeadScore: (...args: unknown[]) => mockUseContactLeadScore(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('../../AISuggestions', () => ({
  AISuggestions: () => <div>mock-ai-suggestions</div>,
}));
vi.mock('../../ConversationSummary', () => ({ ConversationSummary: () => <div>mock-summary</div> }));
vi.mock('../../ObjectionDetector', () => ({ ObjectionDetector: () => <div>mock-objections</div> }));

function chain() {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.order = () => q;
  q.limit = () => Promise.resolve({ data: [], error: null });
  return q;
}

const conversation: Conversation = {
  id: 'conv-1',
  contact: { id: 'contact-1', name: 'Cliente Teste', phone: '5511999999999', tags: [], ai_sentiment: 'positive' },
  unreadCount: 0,
  status: 'open',
} as unknown as Conversation;

function renderTab(latestAnalysis: Record<string, unknown>) {
  mockUseLatestAnalysis.mockReturnValue(latestAnalysis);
  mockUseNextBestAction.mockReturnValue({ actions: [], loading: false });
  mockUseContactLeadScore.mockReturnValue({ data: null });
  mockFrom.mockReturnValue(chain());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AiTab conversation={conversation} messages={[]} onUseSuggestion={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('AiTab — falha ao carregar a análise', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o erro e NÃO "Sem análise ainda"', () => {
    renderTab({ data: undefined, isError: true, refetch: vi.fn() });

    expect(screen.getByTestId('analysis-error')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar a análise')).toBeInTheDocument();
    expect(screen.queryByText('Sem análise ainda')).not.toBeInTheDocument();
  });

  it('"Tentar novamente" chama o refetch da análise', () => {
    const refetch = vi.fn();
    renderTab({ data: undefined, isError: true, refetch });

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('sem erro, mantém o rótulo de sempre', () => {
    renderTab({ data: null, isError: false, refetch: vi.fn() });

    expect(screen.queryByTestId('analysis-error')).not.toBeInTheDocument();
    expect(screen.getByText('Sem análise ainda')).toBeInTheDocument();
  });
});
