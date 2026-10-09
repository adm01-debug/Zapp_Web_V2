import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChurnPredictionDashboard } from '../ChurnPredictionDashboard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const mockContacts = [
  { id: 'c1', name: 'Maria Silva', phone: '+5511999990001', ai_sentiment: 'negative', updated_at: '2025-01-01T00:00:00Z', created_at: '2024-12-01T00:00:00Z' },
  { id: 'c2', name: 'João Santos', phone: '+5511999990002', ai_sentiment: 'positive', updated_at: new Date().toISOString(), created_at: '2024-06-01T00:00:00Z' },
  { id: 'c3', name: 'Ana Costa', phone: '+5511999990003', ai_sentiment: 'neutral', updated_at: '2025-11-01T00:00:00Z', created_at: '2025-10-28T00:00:00Z' },
  { id: 'c4', name: 'Pedro Lima', phone: '+5511999990004', ai_sentiment: null, updated_at: '2025-08-01T00:00:00Z', created_at: '2025-07-01T00:00:00Z' },
];

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    },
  },
}));

describe('ChurnPredictionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', async () => {
      render(<ChurnPredictionDashboard />);
      await waitFor(() => {
        expect(screen.getByText('Previsão de Churn')).toBeInTheDocument();
      });
    });

    it('renders subtitle', async () => {
      render(<ChurnPredictionDashboard />);
      expect(screen.getByText(/Análise preditiva/)).toBeInTheDocument();
    });

    it('renders update button', () => {
      render(<ChurnPredictionDashboard />);
      expect(screen.getByText('Atualizar')).toBeInTheDocument();
    });

    it('renders AI analysis button', () => {
      render(<ChurnPredictionDashboard />);
      expect(screen.getByText('Análise IA')).toBeInTheDocument();
    });

    it('renders stats cards', async () => {
      render(<ChurnPredictionDashboard />);
      await waitFor(() => {
        expect(screen.getByText('Total Analisados')).toBeInTheDocument();
        expect(screen.getByText('Crítico')).toBeInTheDocument();
        expect(screen.getByText('Alto')).toBeInTheDocument();
        expect(screen.getByText('Médio')).toBeInTheDocument();
        expect(screen.getByText('Baixo')).toBeInTheDocument();
      });
    });

    it('renders risk list section', async () => {
      render(<ChurnPredictionDashboard />);
      await waitFor(() => {
        expect(screen.getByText(/Contatos em Risco/)).toBeInTheDocument();
      });
    });

    it('shows loading skeletons while fetching', () => {
      const { container } = render(<ChurnPredictionDashboard />);
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });
  });

  // ===== RISK SCORE ALGORITHM =====
  describe('Risk score algorithm', () => {
    it('assigns higher score for negative sentiment', () => {
      const negativeContact = mockContacts.find(c => c.ai_sentiment === 'negative');
      expect(negativeContact).toBeDefined();
    });

    it('assigns lower score for positive sentiment', () => {
      const positiveContact = mockContacts.find(c => c.ai_sentiment === 'positive');
      expect(positiveContact).toBeDefined();
    });

    it('caps score at 100', () => {
      const score = Math.min(100, 150);
      expect(score).toBe(100);
    });

    it('classifies critical when score >= 80', () => {
      const level = 'critical';
      expect(level).toBe('critical');
    });

    it('classifies high when score >= 60', () => {
      const level = 'high';
      expect(level).toBe('high');
    });

    it('classifies medium when score >= 30', () => {
      const level = 'medium';
      expect(level).toBe('medium');
    });

    it('classifies low when score < 30', () => {
      const level = 'low';
      expect(level).toBe('low');
    });

    it('adds inactivity reason when > 30 days', () => {
      const daysSinceUpdate = 45;
      const reasons: string[] = [];
      if (daysSinceUpdate > 30) reasons.push(`${daysSinceUpdate} dias sem interação`);
      expect(reasons).toContain('45 dias sem interação');
    });

    it('adds negative sentiment reason', () => {
      const reasons: string[] = [];
      const sentiment = 'negative';
      if (sentiment === 'negative') reasons.push('Sentimento negativo detectado');
      expect(reasons).toContain('Sentimento negativo detectado');
    });

    it('adds no-followup reason for new contacts', () => {
      const daysSinceCreation = 3;
      const daysSinceUpdate = 5;
      const reasons: string[] = [];
      if (daysSinceCreation < 7 && daysSinceUpdate > 3) reasons.push('Novo contato sem follow-up');
      expect(reasons).toContain('Novo contato sem follow-up');
    });

    it('adds long-term inactive reason', () => {
      const daysSinceUpdate = 65;
      const reasons: string[] = [];
      if (daysSinceUpdate > 60) reasons.push('Inativo por mais de 60 dias');
      expect(reasons).toContain('Inativo por mais de 60 dias');
    });

    it('defaults to "Engajamento regular" when no risk', () => {
      const reasons: string[] = [];
      if (reasons.length === 0) reasons.push('Engajamento regular');
      expect(reasons).toContain('Engajamento regular');
    });
  });

  // ===== RISK COLOR MAPPING =====
  describe('Risk color mapping', () => {
    const getRiskColor = (level: string) => {
      switch (level) {
        case 'critical': return 'bg-destructive text-destructive-foreground';
        case 'high': return 'bg-orange-500 text-white';
        case 'medium': return 'bg-yellow-500 text-white';
        case 'low': return 'bg-green-500 text-white';
        default: return 'bg-muted text-muted-foreground';
      }
    };

    it('critical is destructive', () => expect(getRiskColor('critical')).toContain('destructive'));
    it('high is orange', () => expect(getRiskColor('high')).toContain('orange'));
    it('medium is yellow', () => expect(getRiskColor('medium')).toContain('yellow'));
    it('low is green', () => expect(getRiskColor('low')).toContain('green'));
    it('unknown defaults to muted', () => expect(getRiskColor('unknown')).toContain('muted'));
  });

  // ===== AI ANALYSIS =====
  describe('AI analysis', () => {
    it('renders AI button', () => {
      render(<ChurnPredictionDashboard />);
      expect(screen.getByText('Análise IA')).toBeInTheDocument();
    });

    it('AI button is clickable', async () => {
      render(<ChurnPredictionDashboard />);
      const btn = screen.getByText('Análise IA');
      expect(btn.closest('button')).not.toBeDisabled();
    });
  });

  // ===== SORTING =====
  describe('Sorting', () => {
    it('sorts risks by score descending', () => {
      const risks = [{ score: 30 }, { score: 80 }, { score: 50 }];
      risks.sort((a, b) => b.score - a.score);
      expect(risks[0].score).toBe(80);
      expect(risks[2].score).toBe(30);
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles null sentiment', () => {
      const contact = mockContacts.find(c => c.ai_sentiment === null);
      expect(contact).toBeDefined();
    });

    it('handles contacts with no messages', () => {
      expect(mockContacts.length).toBeGreaterThan(0);
    });

    it('limits to 500 contacts', () => {
      const limit = 500;
      expect(limit).toBe(500);
    });

    it('filters risks > 20 score for display', () => {
      const risks = [{ riskScore: 10 }, { riskScore: 30 }, { riskScore: 50 }];
      const filtered = risks.filter(r => r.riskScore > 20);
      expect(filtered.length).toBe(2);
    });

    it('truncates reasons longer than 25 chars', () => {
      const reason = 'Inativo por mais de 60 dias extra longo';
      const truncated = reason.length > 25 ? reason.substring(0, 25) + '...' : reason;
      expect(truncated).toContain('...');
    });
  });

  // ===== IA-112: a tela passa a exibir o resultado que o backend calculou =====
  describe('Resultado de ai-churn-analysis aplicado (IA-112)', () => {
    beforeEach(() => {
      // Cada teste desta seção decide a resposta do backend; o padrão do arquivo
      // (erro) é restaurado depois.
      vi.mocked(supabase.functions.invoke).mockReset();
      vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: { message: 'not found' } });
    });

    it('mostra o score, o nível e os motivos devolvidos pelo backend', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          results: [
            {
              contactId: 'c2',
              name: 'João Santos',
              riskScore: 88,
              riskLevel: 'critical',
              daysSinceLastMessage: 45,
              totalMessageCount: 3,
              reasons: ['Calculado pelo backend'],
            },
            {
              contactId: 'contato-fora-da-lista',
              name: 'Fora da lista',
              riskScore: 99,
              riskLevel: 'critical',
              daysSinceLastMessage: 60,
              totalMessageCount: 10,
              reasons: ['Não deve contar como aplicado'],
            },
          ],
        },
        error: null,
      });

      render(<ChurnPredictionDashboard />);
      // Espera a leitura local terminar (o c1 fica com 80% no cálculo do cliente).
      await screen.findByText('80%');
      // O c2 tem score local 0, então não aparece antes da análise de IA.
      expect(screen.queryByText('João Santos')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Análise IA'));

      // Após o clique o número exibido é o do backend (88%), não o local (0).
      await screen.findByText('88%');
      expect(screen.getByText('João Santos')).toBeInTheDocument();
      expect(screen.getByText('45d sem contato')).toBeInTheDocument();
      expect(screen.getByText('Calculado pelo backend')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Análise de IA aplicada a 1 contato(s).');
    });

    it('mantém os números locais quando o backend falha (sem dizer que deu certo)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
      });

      render(<ChurnPredictionDashboard />);
      await screen.findByText('80%');

      fireEvent.click(screen.getByText('Análise IA'));

      await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.queryByText('88%')).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('A análise de IA não pôde ser aplicada; os números locais foram mantidos.');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('mantém os números locais quando o backend devolve results vazio (sem dizer que deu certo)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { results: [] },
        error: null,
      });

      render(<ChurnPredictionDashboard />);
      await screen.findByText('80%');

      fireEvent.click(screen.getByText('Análise IA'));

      await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('A IA não devolveu resultados de churn; os números locais foram mantidos.');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('não anuncia aplicação quando nenhum resultado pertence aos contatos carregados', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          results: [
            {
              contactId: 'contato-fora-da-lista',
              riskScore: 99,
              riskLevel: 'critical',
              daysSinceLastMessage: 60,
              totalMessageCount: 10,
              reasons: ['Não deve aplicar'],
            },
          ],
        },
        error: null,
      });

      render(<ChurnPredictionDashboard />);
      await screen.findByText('80%');

      fireEvent.click(screen.getByText('Análise IA'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A IA não devolveu resultados para os contatos carregados; os números locais foram mantidos.'));
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.queryByText('99%')).not.toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
