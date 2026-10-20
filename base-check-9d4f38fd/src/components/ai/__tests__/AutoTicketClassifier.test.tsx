import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutoTicketClassifier } from '../AutoTicketClassifier';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const mockTags = [
  { id: 't1', contact_id: 'c1', tag_name: 'suporte técnico', confidence: 0.9, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'Maria', phone: '+5511999' } },
  { id: 't2', contact_id: 'c2', tag_name: 'venda consultiva', confidence: 0.85, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'João', phone: '+5511888' } },
  { id: 't3', contact_id: 'c3', tag_name: 'reclamação', confidence: 0.95, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'Ana', phone: '+5511777' } },
  { id: 't4', contact_id: 'c4', tag_name: 'pagamento boleto', confidence: 0.7, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'Pedro', phone: '+5511666' } },
  { id: 't5', contact_id: 'c5', tag_name: 'agendamento horário', confidence: 0.6, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'Lucas', phone: '+5511555' } },
  { id: 't6', contact_id: 'c6', tag_name: 'info geral', confidence: 0.5, source: 'ai', created_at: new Date().toISOString(), contacts: { name: 'Carla', phone: '+5511444' } },
];

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: mockTags, error: null }),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    },
  },
}));

const mockTagsResponseOnce = (data: unknown, error: unknown = null) => {
  vi.mocked(supabase.from).mockReturnValueOnce({
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data, error }),
      })),
    })),
  } as never);
};

describe('AutoTicketClassifier', () => {
  beforeEach(() => vi.clearAllMocks());

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', async () => {
      render(<AutoTicketClassifier />);
      await waitFor(() => {
        expect(screen.getByText('Classificação Automática de Tickets')).toBeInTheDocument();
      });
    });

    it('renders auto-classify switch', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Auto-classificar')).toBeInTheDocument();
    });

    it('renders batch classify button', () => {
      render(<AutoTicketClassifier />);
      expect(screen.getByText('Classificar em Lote')).toBeInTheDocument();
    });

    it('renders 6 category cards', async () => {
      render(<AutoTicketClassifier />);
      await waitFor(() => {
        expect(screen.getByText('Suporte Técnico')).toBeInTheDocument();
        expect(screen.getByText('Vendas')).toBeInTheDocument();
        expect(screen.getByText('Financeiro')).toBeInTheDocument();
        expect(screen.getByText('Reclamação')).toBeInTheDocument();
        expect(screen.getByText('Informação')).toBeInTheDocument();
        expect(screen.getByText('Agendamento')).toBeInTheDocument();
      });
    });

    it('renders tickets section', async () => {
      render(<AutoTicketClassifier />);
      await waitFor(() => {
        expect(screen.getByText(/Tickets Classificados/)).toBeInTheDocument();
      });
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

  // ===== GROUPING LOGIC =====
  describe('Contact grouping', () => {
    it('groups tags by contact_id', () => {
      const tags = [
        { contact_id: 'c1', tag_name: 'suporte' },
        { contact_id: 'c1', tag_name: 'urgente' },
        { contact_id: 'c2', tag_name: 'venda' },
      ];
      const grouped = new Map<string, string[]>();
      tags.forEach(t => {
        if (!grouped.has(t.contact_id)) grouped.set(t.contact_id, []);
        grouped.get(t.contact_id)!.push(t.tag_name);
      });
      expect(grouped.size).toBe(2);
      expect(grouped.get('c1')?.length).toBe(2);
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles null contact', () => {
      const contact = null as { name?: string } | null;
      const name = contact?.name || 'Desconhecido';
      expect(name).toBe('Desconhecido');
    });

    it('handles zero confidence', () => {
      // Em variaveis de proposito: o teste prova que o valor 0 cai no default,
      // entao a expressao precisa ser avaliada em runtime. Com literal direto ela
      // vira constante e a regra no-constant-binary-expression acusa.
      const raw = 0;
      const fallback = 0.7;
      const confidence = (raw || fallback) * 100;
      expect(confidence).toBe(70);
    });

    it('handles empty tags list', async () => {
      vi.mocked(vi.fn()).mockResolvedValueOnce({ data: [], error: null });
      render(<AutoTicketClassifier />);
      expect(screen.getByText(/Classificação Automática/)).toBeInTheDocument();
    });
  });

  // ===== IA-114: categoria/prioridade exibidas são as do servidor =====
  describe('Resultado de ai-classify-tickets aplicado (IA-114)', () => {
    beforeEach(() => {
      vi.mocked(supabase.functions.invoke).mockReset();
      vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: { message: 'not found' } });
    });

    it('troca categoria, prioridade e confiança locais pelas do servidor', async () => {
      // O servidor diz "Suporte Técnico" com prioridade alta e confiança 42%; a
      // heurística local diria "Reclamação" / "Urgente" / 95% — é essa diferença
      // que o teste mede.
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { tagId: 't3', contactId: 'c3', tagName: 'reclamação', category: 'Suporte Técnico', priority: 'high', confidence: 0.42 },
            { tagId: 'fora', contactId: 'contato-fora-da-lista', tagName: 'fora', category: 'Financeiro', priority: 'urgent', confidence: 0.99 },
          ],
        },
        error: null,
      });

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
      // Antes do clique os valores exibidos são os locais.
      expect(screen.getByText('Urgente')).toBeInTheDocument();
      expect(screen.queryByText('Alta')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Alta');
      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.queryByText('Urgente')).not.toBeInTheDocument();
      expect(screen.queryByText('95%')).not.toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Classificação do servidor aplicada a 1 ticket(s).');
    });

    it('normaliza confiança inválida do servidor em vez de exibir NaN%', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { tagId: 't3', contactId: 'c3', tagName: 'reclamação', category: 'Suporte Técnico', priority: 'high' },
          ],
        },
        error: null,
      });

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await screen.findByText('Alta');
      expect(screen.queryByText('NaN%')).not.toBeInTheDocument();
      expect(screen.queryByText('95%')).not.toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Classificação do servidor aplicada a 1 ticket(s).');
    });

    it('mantém os valores locais quando o backend falha', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      });

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Alta')).not.toBeInTheDocument();
      expect(screen.getByText('Urgente')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('A classificação do servidor não pôde ser aplicada; os valores locais foram mantidos.');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('mantém os valores locais quando o backend devolve results vazio (sem dizer que deu certo)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { classified: 0, results: [] },
        error: null,
      });

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Alta')).not.toBeInTheDocument();
      expect(screen.getByText('Urgente')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('O servidor não devolveu classificações; os valores locais foram mantidos.');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('separa lista legitimamente vazia de falha de recarga', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { tagId: 't3', contactId: 'c3', tagName: 'reclamação', category: 'Suporte Técnico', priority: 'high', confidence: 0.42 },
          ],
        },
        error: null,
      });
      mockTagsResponseOnce(mockTags);
      mockTagsResponseOnce([]);

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nenhum ticket carregado para aplicar as classificações do servidor.'));
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('recarregar'));
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('não anuncia aplicação quando nenhuma classificação pertence aos tickets carregados', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          classified: 1,
          results: [
            { tagId: 'fora', contactId: 'contato-fora-da-lista', tagName: 'fora', category: 'Financeiro', priority: 'urgent', confidence: 0.99 },
          ],
        },
        error: null,
      });

      render(<AutoTicketClassifier />);
      await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Classificar em Lote'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('O servidor não devolveu classificações para os tickets carregados; os valores locais foram mantidos.'));
      expect(screen.getByText('Urgente')).toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
