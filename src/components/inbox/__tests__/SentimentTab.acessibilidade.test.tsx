import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SentimentTab } from '../ai-tools/SentimentTab';

const mockAnalysis = {
  summary: 'Resumo',
  status: 'complete',
  keyPoints: ['Ponto 1'],
  nextSteps: ['Próximo 1'],
  sentiment: 'positive',
  sentimentScore: 0.7,
  customerSatisfaction: 4,
};

describe('SentimentTab — acessibilidade', () => {
  it('barra de sentimento tem aria-label acessível', () => {
    render(
      <TooltipProvider>
        <SentimentTab analysis={mockAnalysis} sentiment={0.7} currentSentiment="positive" analyses={[]} />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText('Sentimento')).toBeInTheDocument();
  });

  it('axe: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <SentimentTab analysis={mockAnalysis} sentiment={0.7} currentSentiment="positive" analyses={[]} />
      </TooltipProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});