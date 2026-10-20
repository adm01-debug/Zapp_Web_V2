import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NowPanel } from '../overview/NowPanel';
import type { RealtimeDashboardState } from '@/hooks/analytics/useRealtimeDashboard';

function baseRealtime(overrides: Partial<RealtimeDashboardState> = {}): RealtimeDashboardState {
  return {
    messagesThisHour: 0,
    messagesLastHour: 0,
    messagesPerMinute: 0,
    activeConversationsNow: 18,
    newContactsToday: 0,
    unreadMessages: 0,
    metricsHistory: [],
    lastMessageAt: null,
    isConnected: true,
    ...overrides,
  };
}

describe('NowPanel', () => {
  it('conectado: chip "Ao vivo"', () => {
    render(<NowPanel realtime={baseRealtime({ isConnected: true })} pendingConversations={6} slaBreachedToday={2} busiestQueue={null} />);
    expect(screen.getByText('Ao vivo')).toBeInTheDocument();
  });

  it('offline: chip "Offline" em vez de "Ao vivo"', () => {
    render(<NowPanel realtime={baseRealtime({ isConnected: false })} pendingConversations={6} slaBreachedToday={2} busiestQueue={null} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Ao vivo')).not.toBeInTheDocument();
  });

  it('renderiza as 4 linhas com os valores reais recebidos por prop', () => {
    render(
      <NowPanel
        realtime={baseRealtime({ activeConversationsNow: 18 })}
        pendingConversations={6}
        slaBreachedToday={3}
        busiestQueue={{ queueId: 'q1', name: 'Comercial', color: '#000', waiting: 8, inService: 4, avgResponse: 120, slaRate: 92, status: 'bom' }}
      />,
    );
    expect(screen.getAllByTestId('now-row')).toHaveLength(4);
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Comercial (12)')).toBeInTheDocument();
  });

  it('sem fila com maior volume, mostra travessão em vez de quebrar', () => {
    render(<NowPanel realtime={baseRealtime()} pendingConversations={0} slaBreachedToday={0} busiestQueue={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
