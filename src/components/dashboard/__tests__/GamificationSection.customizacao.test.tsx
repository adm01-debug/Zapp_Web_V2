import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GamificationSection } from '../overview/GamificationSection';
import type { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import type { DashboardStats } from '../DashboardWidgetRenderer';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children?: React.ReactNode }) => <>{children}</> },
  useReducedMotion: () => false,
}));

// #fix — a seção de Gamificação tinha uma 2ª instância própria de
// useDashboardWidgets: o painel "Personalizar" não surtia efeito nela até
// recarregar. Com a config vinda por prop, visibilidade e ordem passam a ser
// as do painel.
vi.mock('../DashboardWidgetRenderer', () => ({
  DashboardWidgetRenderer: ({ widget }: { widget: DashboardWidget }) => (
    <div data-testid={`widget-${widget.id}`}>{widget.title}</div>
  ),
}));

const stats = {} as DashboardStats;

function widget(partial: Partial<DashboardWidget> & Pick<DashboardWidget, 'id' | 'type' | 'order' | 'level'>): DashboardWidget {
  return {
    title: partial.id, visible: true, size: 'medium', column: 0, row: 0, width: 2, height: 1,
    ...partial,
  } as DashboardWidget;
}

const challenges = widget({ id: 'challenges', type: 'challenges', order: 1, level: 2 });
const aiStats = widget({ id: 'ai-stats', type: 'ai-stats', order: 4, level: 3 });
const leaderboard = widget({ id: 'leaderboard', type: 'leaderboard', order: 5, level: 3 });
// level 2 mas com type 'queues': NÃO pertence à gamificação (é cartão fixo).
const filas = widget({ id: 'queues', type: 'queues', order: 2, level: 2 });

function renderSecao(visibleWidgets: DashboardWidget[], isStaff = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <GamificationSection stats={stats} isStaff={isStaff} visibleWidgets={visibleWidgets} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /Expandir/i }));
}

describe('GamificationSection — respeita a config compartilhada', () => {
  it('renderiza os widgets na ordem da config (não na ordem do código)', () => {
    renderSecao([aiStats, challenges]);
    const ids = screen.getAllByTestId(/^widget-/).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['widget-challenges', 'widget-ai-stats']);
  });

  it('some com o widget que o usuário desligou (já fora de visibleWidgets)', () => {
    renderSecao([challenges]);
    expect(screen.getByTestId('widget-challenges')).toBeTruthy();
    expect(screen.queryByTestId('widget-ai-stats')).toBeNull();
  });

  it('não puxa para a gamificação um cartão fixo (queues, level 2)', () => {
    renderSecao([challenges, filas, aiStats]);
    expect(screen.queryByTestId('widget-queues')).toBeNull();
  });

  it('esconde o Ranking de quem não é staff', () => {
    renderSecao([challenges, leaderboard], false);
    expect(screen.queryByTestId('widget-leaderboard')).toBeNull();
  });
});
