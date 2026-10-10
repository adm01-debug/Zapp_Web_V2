import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SummaryResult } from '../summary/SummaryResult';

const mockSummary = {
  summary: 'Resumo da conversa',
  keyPoints: ['Ponto 1', 'Ponto 2'],
  nextSteps: ['Próximo 1'],
};

describe('SummaryResult — acessibilidade', () => {
  it('botões de TTS têm aria-label acessíveis', () => {
    render(
      <TooltipProvider>
        <SummaryResult
          summary={mockSummary}
          isTtsPlaying={false}
          isTtsLoading={false}
          lastTtsText={null}
          onPlayTts={vi.fn()}
          buildFullNarrationText={() => ''}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: /ouvir resumo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ouvir pontos-chave/i })).toBeInTheDocument();
  });

  it('axe: sem violações de button-name', async () => {
    const { container } = render(
      <TooltipProvider>
        <SummaryResult
          summary={mockSummary}
          isTtsPlaying={false}
          isTtsLoading={false}
          lastTtsText={null}
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