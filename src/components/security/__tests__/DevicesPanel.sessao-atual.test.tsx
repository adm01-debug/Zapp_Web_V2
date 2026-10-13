/**
 * Cartao t_5cc4a897 — Sessoes ativas: a marca "Sessao atual" era dada por
 * DISPOSITIVO (session.device_id === currentDeviceId). Com dois logins no mesmo
 * aparelho, as duas sessoes apareciam como atuais e nenhuma tinha o botao de
 * encerrar. A correcao compara o claim `session_id` do JWT com
 * user_sessions.auth_session_id — a SESSAO atual, nao o dispositivo.
 * Vermelho antes (2 marcadas / 0 encerrar); verde depois (1 / 1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const authState = vi.hoisted(() => ({ accessToken: '' as string }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ session: { access_token: authState.accessToken } }),
}));
vi.mock('@/hooks/ui/useDeviceDetection', () => ({
  useDeviceDetection: () => ({
    devices: [
      {
        id: 'd1',
        device_name: 'Notebook',
        browser: 'Chrome',
        os: 'Linux',
        ip_address: '10.0.0.1',
        is_trusted: true,
        last_seen_at: '2026-10-01T11:00:00.000Z',
      },
    ],
    sessions: [
      { id: 's1', device_id: 'd1', ip_address: '10.0.0.1', started_at: '2026-10-01T10:00:00.000Z', auth_session_id: 'auth-s1' },
      { id: 's2', device_id: 'd1', ip_address: '10.0.0.2', started_at: '2026-10-01T11:00:00.000Z', auth_session_id: 'auth-s2' },
    ],
    isLoading: false,
    currentDeviceId: 'd1',
    trustDevice: vi.fn(),
    removeDevice: vi.fn(),
    endSession: vi.fn(),
    endAllOtherSessions: vi.fn(),
    refetch: vi.fn(),
  }),
}));

import { DevicesPanel } from '../DevicesPanel';

function tokenComSessao(sessionId: string) {
  const payload = btoa(JSON.stringify({ sub: 'u1', session_id: sessionId }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `cabecalho.${payload}.assinatura`;
}

describe('DevicesPanel — marca a sessao atual, nao o dispositivo', () => {
  beforeEach(() => {
    authState.accessToken = tokenComSessao('auth-s1');
  });

  it('marca como atual apenas a sessao do JWT corrente', () => {
    render(<DevicesPanel />);
    expect(screen.getAllByText('Sessão atual')).toHaveLength(1);
  });

  it('deixa a outra sessao do mesmo aparelho com o botao Encerrar', () => {
    render(<DevicesPanel />);
    expect(screen.getAllByRole('button', { name: 'Encerrar' })).toHaveLength(1);
  });

  it('falha fechado: token sem o claim session_id nao marca sessao nenhuma', () => {
    authState.accessToken = 'nao-e-um-jwt';
    render(<DevicesPanel />);
    expect(screen.queryByText('Sessão atual')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Encerrar' })).toHaveLength(2);
  });
});
