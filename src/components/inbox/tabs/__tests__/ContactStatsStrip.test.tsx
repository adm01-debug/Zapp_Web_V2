import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactStatsStrip } from '../ContactStatsStrip';
import type { ContactStats } from '@/hooks/crm/useContactStats';

const mockUseContactStats = vi.fn();

vi.mock('@/hooks/crm/useContactStats', () => ({
  useContactStats: (...args: unknown[]) => mockUseContactStats(...args),
}));

const STATS: ContactStats = {
  totalMessages: 150,
  avgResponseTimeMinutes: 45,
  totalConversations: 12,
  csatAverage: 4.5,
  csatCount: 3,
};

function renderStrip(data: ContactStats | undefined = STATS, isLoading = false) {
  mockUseContactStats.mockReturnValue({ data, isLoading });
  return render(<ContactStatsStrip contactId="c1" />);
}

describe('ContactStatsStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os valores do hook nos 4 tiles', () => {
    renderStrip();
    const strip = screen.getByTestId('contact-stats-strip');
    expect(strip).toHaveTextContent('150');
    expect(strip).toHaveTextContent('45min');
    expect(strip).toHaveTextContent('12');
    expect(strip).toHaveTextContent('4.5⭐');
    expect(strip).toHaveTextContent('Total trocado');
    expect(strip).toHaveTextContent('Resposta ao cliente');
    expect(strip).toHaveTextContent('Dias com mensagens');
    expect(strip).toHaveTextContent('3 avaliações');
  });

  it('90 minutos vira "1h30m"', () => {
    renderStrip({ ...STATS, avgResponseTimeMinutes: 90 });
    expect(screen.getByTestId('contact-stats-strip')).toHaveTextContent('1h30m');
  });

  it('sem CSAT mostra "—" e "Sem avaliações"', () => {
    renderStrip({ ...STATS, csatAverage: null, csatCount: 0 });
    const strip = screen.getByTestId('contact-stats-strip');
    expect(strip).toHaveTextContent('—');
    expect(strip).toHaveTextContent('Sem avaliações');
  });

  it('não exibe variação percentual (achado 1: sparkData/change eram inventados)', () => {
    renderStrip();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('isLoading renderiza skeleton com 4 blocos', () => {
    renderStrip(undefined, true);
    const strip = screen.getByTestId('contact-stats-strip');
    expect(strip.children).toHaveLength(4);
  });
});
