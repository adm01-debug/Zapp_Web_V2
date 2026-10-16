import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutoTicketClassifier } from '../AutoTicketClassifier';
import { toast } from 'sonner';

const { fromMock, invokeMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: invokeMock },
  },
}));

/**
 * Mock da ÚNICA leitura que a tela faz no banco depois do servidor:
 * `from('contacts').select('id, name').in('id', ids)`.
 */
const mockContactsOnce = (rows: Array<{ id: string; name: string }> | null, error: unknown = null) => {
  fromMock.mockReturnValueOnce({
    select: vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ data: rows, error }),
    })),
  } as never);
};

/** Tabelas consultadas pela tela no teste (nome passado ao primeiro argumento de `from`). */
const tabelasConsultadas = () => fromMock.mock.calls.map(c => c[0] as string);

describe('AutoTicketClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Classificação Automática de Tickets')).toBeInTheDocument();
    });

    it('renders auto-classify switch', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Auto-classificar')).toBeInTheDocument();
    });

    it('renders batch classify button', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Classificar em Lote')).toBeInTheDocument();
    });

    it('renders 6 category cards', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Suporte Técnico')).toBeInTheDocument();
      expect(screen.getByText('Vendas')).toBeInTheDocument();
      expect(screen.getByText('Financeiro')).toBeInTheDocument();
      expect(screen.getByText('Reclamação')).toBeInTheDocument();
      expect(screen.getByText('Informação')).toBeInTheDocument();
      expect(screen.getByText('Agendamento')).toBeInTheDocument();
    });

    it('renders tickets section', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText(/Tickets Classificados/)).toBeInTheDocument();
    });
  });

  // ===== IA-114: a tela NÃO lê ai_conversation_tags =====
  describe('Ausência de etiquetas de IA (IA-114)', () => {
    it('não consulta nada no banco ao montar', () => {
      render(<AutoTicketClassifier />);

      expect(fromMock).not.toHaveBeenCalled();
      expect(invokeMock).not.toHaveBeenCalled();
      expect(screen.getByText('Nenhum ticket classificado ainda')).toBeInTheDocument();
    });

    it('abre no estado vazio — não há mais lista local de tickets', () => {
      render(<AutoTicketClassifier />);

      expect(screen.getByText(/Tickets Classificados \(0\)/)).toBeInTheDocument();
      expect(screen.getByText('Iniciar Classificação')).toBeInTheDocument();
    });

    it('nunca consulta a tabela ai_conversation_tags (nem no lote)', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { classified: 1, results: [{ contactId: 'c3', category: 'Suporte Técnico', priority: 'high', confidence: 0.42 }] },
        error: null,
      });
      mockContactsOnce([{ id: 'c3', name: 'Ana' }]);

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));
      await screen.findByText('Ana');

      expect(tabelasConsultadas()).toEqual(['contacts']);
      expect(tabelasConsultadas()).not.toContain('ai_conversation_tags');
    });
  });

  // ===== CLASSIFICATION LOGIC =====
  describe('Classification logic (classifyTag)', () => {
    const classifyTag = (tagName: string): string => {
      const lower = tagName.toLowerCase();
      if (lower.includes('suporte') || lower.includes('bug') || lower.includes('erro')) return 'Suporte Técnico';
      if (lower.includes('vend') || lower.includes('preço') || lower.includes('compra')) return 'Vendas';
      if (lower.includes('pag') || lower.includes('boleto') || lower.includes('fatura')) return 'Financeiro';
      if (lower.includes('reclam') || lower.includes('insatisf')) return 'Reclamação';
      if (lower.includes('agend') || lower.includes('horário')) return 'Agendamento';
      return 'Informação';
    };

    it('classifies suporte', () => expect(classifyTag('suporte técnico')).toBe('Suporte Técnico'));
    it('classifies bug as suporte', () => expect(classifyTag('bug report')).toBe('Suporte Técnico'));
    it('classifies erro as suporte', () => expect(classifyTag('erro no sistema')).toBe('Suporte Técnico'));
    it('classifies venda', () => expect(classifyTag('venda consultiva')).toBe('Vendas'));
    it('classifies preço as vendas', () => expect(classifyTag('preço produto')).toBe('Vendas'));
    it('classifies compra as vendas', () => expect(classifyTag('compra online')).toBe('Vendas'));
    it('classifies pagamento as financeiro', () => expect(classifyTag('pagamento pendente')).toBe('Financeiro'));
    it('classifies boleto as financeiro', () => expect(classifyTag('boleto vencido')).toBe('Financeiro'));
    it('classifies fatura as financeiro', () => expect(classifyTag('fatura mensal')).toBe('Financeiro'));
    it('classifies reclamação', () => expect(classifyTag('reclamação grave')).toBe('Reclamação'));
    it('classifies insatisfação as reclamação', () => expect(classifyTag('insatisfeito')).toBe('Reclamação'));
    it('classifies agendamento', () => expect(classifyTag('agendamento consulta')).toBe('Agendamento'));
    it('classifies horário as agendamento', () => expect(classifyTag('horário disponível')).toBe('Agendamento'));
    it('defaults to Informação', () => expect(classifyTag('dúvida geral')).toBe('Informação'));
    it('case insensitive', () => expect(classifyTag('SUPORTE URGENTE')).toBe('Suporte Técnico'));
  });

  // ===== PRIORITY DERIVATION =====
  describe('Priority derivation (derivePriority)', () => {
    const derivePriority = (tagName: string, confidence: number): string => {
      const lower = tagName.toLowerCase();
      if (lower.includes('urgent') || lower.includes('reclam')) return 'urgent';
      if (confidence > 0.8 && (lower.includes('bug') || lower.includes('erro'))) return 'high';
      if (confidence > 0.5) return 'medium';
      return 'low';
    };

    it('urgent for reclamação', () => expect(derivePriority('reclamação', 0.5)).toBe('urgent'));
    it('urgent for urgent tag', () => expect(derivePriority('urgente', 0.3)).toBe('urgent'));
    it('high for bug with high confidence', () => expect(derivePriority('bug crítico', 0.9)).toBe('high'));
    it('high for erro with high confidence', () => expect(derivePriority('erro grave', 0.85)).toBe('high'));
    it('medium for moderate confidence', () => expect(derivePriority('info geral', 0.6)).toBe('medium'));
    it('low for low confidence', () => expect(derivePriority('info geral', 0.3)).toBe('low'));
    it('medium not high for bug with low confidence', () => expect(derivePriority('bug', 0.6)).toBe('medium'));
  });

  // ===== CATEGORY ICONS =====
  describe('Category config', () => {
    const CATEGORIES = [
      { name: 'Suporte Técnico', icon: '🔧' },
      { name: 'Vendas', icon: '💰' },
      { name: 'Financeiro', icon: '💳' },
      { name: 'Reclamação', icon: '⚠️' },
      { name: 'Informação', icon: 'ℹ️' },
      { name: 'Agendamento', icon: '📅' },
    ];

    it('has 6 categories', () => expect(CATEGORIES.length).toBe(6));
    CATEGORIES.forEach(cat => {
      it(`${cat.name} has icon`, () => expect(cat.icon.length).toBeGreaterThan(0));
    });
  });

  // ===== PRIORITY MAP =====
  describe('Priority map', () => {
    const PRIORITY_MAP: Record<string, { label: string }> = {
      urgent: { label: 'Urgente' },
      high: { label: 'Alta' },
      medium: { label: 'Média' },
      low: { label: 'Baixa' },
    };

    it('has 4 priority levels', () => expect(Object.keys(PRIORITY_MAP).length).toBe(4));
    it('urgent label is correct', () => expect(PRIORITY_MAP.urgent.label).toBe('Urgente'));
    it('high label is correct', () => expect(PRIORITY_MAP.high.label).toBe('Alta'));
    it('medium label is correct', () => expect(PRIORITY_MAP.medium.label).toBe('Média'));
    it('low label is correct', () => expect(PRIORITY_MAP.low.label).toBe('Baixa'));
  });

  // ===== IA-114: categoria/prioridade exibidas são as do servidor =====
  describe('Resultado de ai-classify-tickets aplicado (IA-114)', () => {
    it('aplica as classificações do servidor e mostra o nome lido de contacts', async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { contactId: 'c3', category: 'Suporte Técnico', priority: 'high', confidence: 0.42 },
          ],
        },
        error: null,
      });
      mockContactsOnce([{ id: 'c3', name: 'Ana' }]);

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Ana');
      expect(screen.getByText('Alta')).toBeInTheDocument();
      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.getByText(/Tickets Classificados \(1\)/)).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Classificação do servidor aplicada a 1 ticket(s).');
    });

    it('consolida várias classificações do mesmo contato em UM ticket (maior severidade)', async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          classified: 3,
          results: [
            { contactId: 'c1', category: 'Informação', priority: 'medium', confidence: 0.9 },
            { contactId: 'c1', category: 'Reclamação', priority: 'urgent', confidence: 0.2 },
            { contactId: 'c2', category: 'Informação', priority: 'low', confidence: 0.9 },
          ],
        },
        error: null,
      });
      mockContactsOnce([{ id: 'c1', name: 'Maria' }, { id: 'c2', name: 'João' }]);

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Maria');
      expect(screen.getAllByText('Maria')).toHaveLength(1);
      expect(screen.getByText('Urgente')).toBeInTheDocument();
      expect(screen.getByText('Baixa')).toBeInTheDocument();
      expect(screen.getByText(/Tickets Classificados \(2\)/)).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Classificação do servidor aplicada a 2 ticket(s).');
    });

    it('não exibe confiança inválida do servidor (IA-023)', async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { contactId: 'c3', category: 'Suporte Técnico', priority: 'high', confidence: 'alta' },
          ],
        },
        error: null,
      });
      mockContactsOnce([{ id: 'c3', name: 'Ana' }]);

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Alta');
      expect(screen.queryByText('Confiança')).not.toBeInTheDocument();
      expect(screen.queryByText('NaN%')).not.toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Classificação do servidor aplicada a 1 ticket(s).');
    });

    it('mostra Desconhecido quando contacts não devolve o nome', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { classified: 1, results: [{ contactId: 'c9', category: 'Vendas', priority: 'low', confidence: 0.5 }] },
        error: null,
      });
      mockContactsOnce([{ id: 'c9', name: '' }]);

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Desconhecido');
      expect(screen.getByText('Baixa')).toBeInTheDocument();
    });

    it('backend falhou: erro explícito e nada aplicado', async () => {
      invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A classificação do servidor não pôde ser aplicada.'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText('Nenhum ticket classificado ainda')).toBeInTheDocument();
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('results vazio: erro explícito, sem dizer que deu certo', async () => {
      invokeMock.mockResolvedValueOnce({ data: { classified: 0, results: [] }, error: null });

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('O servidor não devolveu classificações; nada foi aplicado.'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText('Nenhum ticket classificado ainda')).toBeInTheDocument();
    });

    it('falha ao ler o nome do contato não inventa classificação', async () => {
      invokeMock.mockResolvedValueOnce({
        data: { classified: 1, results: [{ contactId: 'c3', category: 'Suporte Técnico', priority: 'high', confidence: 0.42 }] },
        error: null,
      });
      mockContactsOnce(null, { message: 'rls' });

      render(<AutoTicketClassifier />);
      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A classificação do servidor não pôde ser aplicada.'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText('Nenhum ticket classificado ainda')).toBeInTheDocument();
    });
  });
});
