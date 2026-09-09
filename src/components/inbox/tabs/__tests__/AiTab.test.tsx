import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AiTab } from '../AiTab';
import type { Conversation } from '@/types/chat';

const mockUseLatestAnalysis = vi.fn();
const mockUseNextBestAction = vi.fn();
const mockUseContactLeadScore = vi.fn();
const mockFrom = vi.fn();
const mockCreateTask = vi.fn();

vi.mock('@/hooks/chat/useLatestAnalysis', () => ({
  useLatestAnalysis: (...args: unknown[]) => mockUseLatestAnalysis(...args),
}));
vi.mock('@/hooks/chat/useNextBestAction', () => ({
  useNextBestAction: (...args: unknown[]) => mockUseNextBestAction(...args),
}));
vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactLeadScore: (...args: unknown[]) => mockUseContactLeadScore(...args),
}));
vi.mock('@/hooks/chat/useConversationTasks', () => ({
  useConversationTasks: () => ({ createTask: mockCreateTask, isCreating: false }),
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
  mockCreateTask.mockResolvedValue(undefined);
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

  it('não quebra com data de análise inválida', () => {
    renderTab({ latestAnalysis: { created_at: 'data-inválida' } });
    expect(screen.getByText('Análise disponível')).toBeInTheDocument();
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

  it('transforma uma próxima ação em tarefa real somente após clique', () => {
    renderTab({
      actions: [{ type: 'follow_up', label: 'Enviar follow-up', description: 'Contato sem resposta', priority: 'medium' }],
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Criar tarefa/i }));
    expect(mockCreateTask).toHaveBeenCalledWith({ title: 'Enviar follow-up', description: 'Contato sem resposta' });
  });

  it('usa grid responsivo ao container, sem depender de breakpoint de viewport', () => {
    renderTab();
    expect(screen.getByTestId('ai-card-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))',
    });
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
