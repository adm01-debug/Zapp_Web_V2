import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('SLA violado usa o token destructive (não a paleta dash-*)', () => {
    const { container } = render(
      <NowPanel realtime={baseRealtime()} pendingConversations={0} slaBreachedToday={3} busiestQueue={null} />,
    );
    expect(container.querySelector('.text-destructive')).not.toBeNull();
    expect(container.querySelector('.text-dash-red')).toBeNull();
  });

  it('tile do SLA violado é tingido bg-destructive/15 (não bg-dash-tile-red, nem bg-destructive sólido)', () => {
    render(
      <NowPanel realtime={baseRealtime()} pendingConversations={0} slaBreachedToday={3} busiestQueue={null} />,
    );
    const slaRow = screen
      .getAllByTestId('now-row')
      .find((row) => within(row).queryByText('SLA violado hoje') !== null);
    expect(slaRow).toBeDefined();
    const tile = slaRow!.children[0];
    expect(tile.classList.contains('bg-destructive/15')).toBe(true);
    expect(tile.classList.contains('bg-destructive')).toBe(false);
    expect(tile.classList.contains('bg-dash-tile-red')).toBe(false);
  });
});
