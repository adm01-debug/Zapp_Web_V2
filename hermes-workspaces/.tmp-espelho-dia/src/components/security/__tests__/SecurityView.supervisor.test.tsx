import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Gate do painel de alertas em tempo real: a Central de Segurança liberava só para admin
 * (`isAdmin`), mas o RateLimitDashboard libera supervisor também (`isAdmin || isSupervisor`).
 * Este teste prova a paridade: supervisor vê o painel, agente comum não.
 */
const papel = vi.hoisted(() => ({ isAdmin: false, isSupervisor: false }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    hasRole: (role: string) => (role === 'admin' ? papel.isAdmin : false),
    isSupervisor: papel.isSupervisor,
  }),
}));

vi.mock('../SecuritySettingsPanel', () => ({ SecuritySettingsPanel: () => <div /> }));
vi.mock('../SecurityOverview', () => ({ SecurityOverview: () => <div /> }));
vi.mock('../DevicesPanel', () => ({ DevicesPanel: () => <div /> }));
vi.mock('../PasskeysPanel', () => ({ PasskeysPanel: () => <div /> }));
vi.mock('../SecurityNotificationsPanel', () => ({ SecurityNotificationsPanel: () => <div /> }));
vi.mock('../BlockedIPsPanel', () => ({ BlockedIPsPanel: () => <div /> }));
vi.mock('../IPWhitelistPanel', () => ({ IPWhitelistPanel: () => <div /> }));
vi.mock('../GeoBlockingPanel', () => ({ GeoBlockingPanel: () => <div /> }));
vi.mock('../PasswordResetRequestsPanel', () => ({ PasswordResetRequestsPanel: () => <div /> }));
vi.mock('../RateLimitConfigPanel', () => ({ RateLimitConfigPanel: () => <div /> }));
vi.mock('../AuditLogDashboard', () => ({ AuditLogDashboard: () => <div /> }));
vi.mock('../QuarantinePanel', () => ({ QuarantinePanel: () => <div /> }));
vi.mock('../RateLimitRealtimeAlerts', () => ({
  RateLimitRealtimeAlerts: () => <div>painel-alertas-marker</div>,
}));
vi.mock('@/hooks/system/useSecurityPushNotifications', () => ({
  useSecurityPushNotifications: () => undefined,
}));

import { SecurityView } from '../SecurityView';

const montar = () => render(<MemoryRouter><SecurityView /></MemoryRouter>);

beforeEach(() => {
  papel.isAdmin = false;
  papel.isSupervisor = false;
});

describe('SecurityView — gate do painel de alertas em tempo real', () => {
  it('supervisor vê o painel (paridade com RateLimitDashboard)', () => {
    papel.isSupervisor = true;
    montar();
    expect(screen.getByText('painel-alertas-marker')).toBeInTheDocument();
  });

  it('admin continua vendo o painel', () => {
    papel.isAdmin = true;
    montar();
    expect(screen.getByText('painel-alertas-marker')).toBeInTheDocument();
  });

  it('agente sem papel de admin/supervisor não vê o painel', () => {
    montar();
    expect(screen.queryByText('painel-alertas-marker')).not.toBeInTheDocument();
  });
});
