import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/business/useWarRoomData', () => ({
  useWarRoomData: () => ({ agents: [], queues: [] }),
  useWarRoomMetrics: () => ({
    totalWaiting: 0, totalBreaches: 0, totalWarnings: 0,
    onlineAgents: 0, totalResolved: 0, avgSatisfaction: 0,
  }),
}));
vi.mock('@/hooks/business/useWarRoomAlerts', () => ({
  useWarRoomAlerts: () => ({ alerts: [], dismissAlert: vi.fn() }),
}));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: { soundEnabled: false }, updateSettings: vi.fn() }),
}));
vi.mock('@/components/inbox/AgentReassignmentPanel', () => ({
  AgentReassignmentPanel: () => null,
}));

import { WarRoomDashboard } from '../WarRoomDashboard';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('WarRoomDashboard — estados vazios', () => {
  it('avisa "Sem ... no período" nas listas de filas, alertas e agentes', () => {
    render(<TooltipProvider><WarRoomDashboard /></TooltipProvider>);

    expect(screen.getByText('Sem filas no período')).toBeInTheDocument();
    expect(screen.getByText('Sem alertas no período')).toBeInTheDocument();
    expect(screen.getByText('Sem agentes no período')).toBeInTheDocument();
  });
});
