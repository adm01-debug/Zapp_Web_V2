import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardKpiRow } from '../overview/DashboardKpiRow';
import type { RealtimeDashboardState } from '@/hooks/analytics/useRealtimeDashboard';

function baseRealtime(overrides: Partial<RealtimeDashboardState> = {}): RealtimeDashboardState {
  return {
    messagesThisHour: 0,
    messagesLastHour: 0,
    messagesPerMinute: 0,
    activeConversationsNow: 0,
    newContactsToday: 0,
    unreadMessages: 5,
    metricsHistory: [],
    lastMessageAt: null,
    isConnected: true,
    ...overrides,
  };
}

describe('DashboardKpiRow', () => {
  it('renderiza os 5 cards com data-testid="kpi-card"', async () => {
    render(
      <DashboardKpiRow
        stats={{ openConversations: 18, pendingConversations: 6, onlineAgents: 3, totalAgents: 3 }}
        realtime={baseRealtime()}
        kpi={{ resolvedToday: 12, resolvedYesterday: 10, deltaResolvedPct: 20, resolvedHourly8: [1, 1, 1, 1, 2, 2, 2, 2], avgResponseToday: 161, avgResponseYesterday: 180, deltaResponsePct: -10, responseHourly8: [10, 10, 10, 10, 20, 20, 20, 20], slaBreachedToday: 1 }}
      />,
    );
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(5);
    // valores numéricos passam por CountUp (animação assíncrona) — aguarda o valor final.
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(screen.getByText('2m 41s')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
  });

  it('sem dado do useDashboardKpi (kpi undefined), mostra "—" e 0 em vez de quebrar', async () => {
    render(
      <DashboardKpiRow
        stats={{ openConversations: 0, pendingConversations: 0, onlineAgents: 0, totalAgents: 0 }}
        realtime={baseRealtime({ unreadMessages: 0 })}
        kpi={undefined}
      />,
    );
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(5);
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});
