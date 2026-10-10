import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToolPanel } from '../ai-tools/ToolPanel';
import { SentimentTab } from '../ai-tools/SentimentTab';
import { SummaryResult } from '../summary/SummaryResult';

const mockAnalysis = {
  summary: 'Resumo',
  status: 'complete',
  keyPoints: ['Ponto 1'],
  nextSteps: ['Próximo 1'],
  sentiment: 'positive',
  sentimentScore: 0.7,
  customerSatisfaction: 4,
};

const mockSummary = {
  summary: 'Resumo da conversa',
  keyPoints: ['Ponto-chave 1', 'Ponto-chave 2'],
  nextSteps: ['Próximo passo 1'],
};

describe('axe — sem violações de button-name em componentes de inbox', () => {
  it('ToolPanel: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <ToolPanel
          isOpen={true}
          onClose={vi.fn()}
          activeTool="analysis"
          onToolChange={vi.fn()}
        />
      </TooltipProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });

  it('SentimentTab: sem violações de button-name', async () => {
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

  it('SummaryResult: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <SummaryResult
          summary={mockSummary}
          isTtsPlaying={false}
          isTtsLoading={false}
          lastTtsText=""
          onPlayTts={vi.fn()}
          buildFullNarrationText={() => ''}
        />
      </TooltipProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});