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
    expect(strip).toHaveTextContent('Sessões registradas');
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

  it('sem dados de variação não exibe badge de percentual', () => {
    renderStrip();
    expect(screen.queryAllByTestId('stats-change-badge')).toHaveLength(0);
  });

  it('exibe badge de variação real quando o hook devolve o percentual', () => {
    renderStrip({ ...STATS, messagesChangePercent: 25, conversationsChangePercent: -50 });
    const badges = screen.getAllByTestId('stats-change-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('25%');
    expect(badges[0].className).toContain('text-success');
    expect(badges[1]).toHaveTextContent('50%');
    expect(badges[1].className).toContain('text-destructive');
  });

  it('isLoading renderiza skeleton com 4 blocos', () => {
    renderStrip(undefined, true);
    const strip = screen.getByTestId('contact-stats-strip');
    expect(strip.children).toHaveLength(4);
  });
});
