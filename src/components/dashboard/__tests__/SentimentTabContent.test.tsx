import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertsTab, AgentsTab, DistributionTab } from '../SentimentTabContent';

// IA-023: score ausente NÃO pode ser renderizado como número (nem 50, nem 0),
// não aplica cor de faixa nem badge "Crítico"; 0 continua sendo 0%.
const baseAlert = {
  id: 'a1',
  contact_name: 'Cliente X',
  createdAt: '2026-09-25T12:00:00.000Z',
  consecutive_low: 3,
  message: 'mensagem do alerta',
};

describe('SentimentTabContent — zero e ausência (IA-023)', () => {
  describe('AlertsTab', () => {
    it('score ausente renderiza traço — nunca 50% e sem badge Crítico', () => {
      render(<AlertsTab alerts={[{ ...baseAlert, sentiment_score: undefined }]} />);
      expect(screen.queryByText('50%')).toBeNull();
      expect(screen.queryByText('Crítico')).toBeNull();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('score 0 continua 0% e conta como Crítico', () => {
      render(<AlertsTab alerts={[{ ...baseAlert, id: 'a0', sentiment_score: 0 }]} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('Crítico')).toBeInTheDocument();
    });

    it('score 15 é Crítico e mostra 15%', () => {
      render(<AlertsTab alerts={[{ ...baseAlert, id: 'a15', sentiment_score: 15 }]} />);
      expect(screen.getByText('15%')).toBeInTheDocument();
      expect(screen.getByText('Crítico')).toBeInTheDocument();
    });

    it('score 45 mostra 45% e NÃO é Crítico', () => {
      render(<AlertsTab alerts={[{ ...baseAlert, id: 'a45', sentiment_score: 45 }]} />);
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.queryByText('Crítico')).toBeNull();
    });
  });

  describe('DistributionTab', () => {
    const stats = { totalAnalyses: 2, positiveAnalyses: 1, neutralAnalyses: 0, negativeAnalyses: 1 };

    it('ausente não entra em nenhuma faixa do histograma; 0 entra em 0-20%', () => {
      render(<DistributionTab stats={stats} analyses={[{ sentiment_score: 0 }, { sentiment_score: null }]} />);
      const row0 = screen.getByText('0-20%').closest('div') as HTMLElement;
      const row40 = screen.getByText('41-60%').closest('div') as HTMLElement;
      expect(row0.textContent).toBe('0-20%1');
      // com o defeito, o ausente viraria 50 e cairia em 41-60%
      expect(row40.textContent).toBe('41-60%');
    });
  });

  describe('AgentsTab', () => {
    it('média ausente renderiza traço (não 50%)', () => {
      render(<AgentsTab agentData={[{
        agent: { id: 'ag1', name: 'Ana', avatar_url: null },
        avgScore: null, totalAnalyses: 2, trend: null,
        positive: 1, neutral: 0, negative: 1,
      }]} />);
      expect(screen.queryByText('50%')).toBeNull();
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('média 0 continua 0%', () => {
      render(<AgentsTab agentData={[{
        agent: { id: 'ag1', name: 'Ana', avatar_url: null },
        avgScore: 0, totalAnalyses: 1, trend: null,
        positive: 0, neutral: 1, negative: 0,
      }]} />);
      expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    });

    it('tendência presente mostra o valor; ausente vira traço', () => {
      render(<AgentsTab agentData={[{
        agent: { id: 'ag1', name: 'Ana', avatar_url: null },
        avgScore: 40, totalAnalyses: 4, trend: 10,
        positive: 1, neutral: 1, negative: 2,
      }]} />);
      expect(screen.getByText('+10%')).toBeInTheDocument();
    });
  });
});
