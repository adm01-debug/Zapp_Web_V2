import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AiTab } from '../AiTab';
import type { Conversation } from '@/types/chat';

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
  AISuggestions: ({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) => (
    <button onClick={() => onSelectSuggestion('sugestão de teste')}>mock-ai-suggestions</button>
  ),
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

function renderTab(overrides: { latestAnalysis?: unknown; actions?: unknown[]; leadScore?: unknown; sentiment?: string | null } = {}) {
  mockUseLatestAnalysis.mockReturnValue({ data: overrides.latestAnalysis ?? null });
  mockUseNextBestAction.mockReturnValue({ actions: overrides.actions ?? [], loading: false });
  mockUseContactLeadScore.mockReturnValue({ data: overrides.leadScore ?? null });
  mockFrom.mockReturnValue(chain());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onUseSuggestion = vi.fn();
  const conv = overrides.sentiment !== undefined
    ? { ...conversation, contact: { ...conversation.contact, ai_sentiment: overrides.sentiment } }
    : conversation;
  render(
    <QueryClientProvider client={qc}>
      <AiTab conversation={conv as Conversation} messages={[]} onUseSuggestion={onUseSuggestion} />
    </QueryClientProvider>
  );
  return { onUseSuggestion };
}

describe('AiTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra "Sem análise ainda" quando não há análise recente', () => {
    renderTab();
    expect(screen.getByText('Sem análise ainda')).toBeInTheDocument();
  });

  it('mostra o horário da última análise quando existe', () => {
    renderTab({ latestAnalysis: { created_at: '2026-09-08T14:30:00.000Z' } });
    expect(screen.getByText(/Análise atualizada às/)).toBeInTheDocument();
  });

  it('"Usar resposta" da sugestão de IA chama onUseSuggestion com o texto', () => {
    const { onUseSuggestion } = renderTab();
    fireEvent.click(screen.getByText('mock-ai-suggestions'));
    expect(onUseSuggestion).toHaveBeenCalledWith('sugestão de teste');
  });

  it('sem ações sugeridas mostra o empty state honesto', () => {
    renderTab({ actions: [] });
    expect(screen.getByText('Sem ações sugeridas')).toBeInTheDocument();
  });

  it('sem sentimento registrado mostra "Sem análise recente"', () => {
    renderTab({ sentiment: null });
    expect(screen.getByText('Sem análise recente')).toBeInTheDocument();
  });

  it('produtos vazios mostra o empty state honesto', async () => {
    renderTab();
    expect(await screen.findByText('Nenhum produto cadastrado')).toBeInTheDocument();
  });
});
