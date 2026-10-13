/**
 * R2-AUTH-005 — a sessão atual vem do JWT (`is_current`), nunca do device_id.
 * Dois logins no MESMO aparelho compartilham o device_id: a regra antiga
 * (`session.device_id === currentDeviceId`) marcava as duas como "Sessão atual"
 * e escondia o botão de encerrar das duas. Aqui o componente é renderizado de
 * verdade, só o hook é dublado — sem mock que já traz a resposta pronta.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface HookState {
  devices: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  loading: boolean;
  currentDeviceId: string | null;
  trustDevice: (id: string) => Promise<void>;
  removeDevice: (id: string) => Promise<void>;
  endSession: (id: string) => Promise<void>;
  endAllOtherSessions: () => Promise<void>;
}

const state: HookState = {
  devices: [],
  sessions: [],
  loading: false,
  currentDeviceId: null,
  trustDevice: vi.fn().mockResolvedValue(undefined),
  removeDevice: vi.fn().mockResolvedValue(undefined),
  endSession: vi.fn().mockResolvedValue(undefined),
  endAllOtherSessions: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/hooks/ui/useDeviceDetection', () => ({
  useDeviceDetection: () => state,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DevicesPanel } from '../DevicesPanel';

const dispositivo = {
  id: 'dev-1',
  device_name: 'Desktop da loja',
  browser: 'Chrome',
  os: 'Windows',
  ip_address: '203.0.113.10',
  is_trusted: true,
  last_seen_at: '2026-10-13T10:00:00Z',
};

function sessao(id: string, isCurrent: boolean) {
  return {
    id,
    device_id: 'dev-1',
    ip_address: '203.0.113.10',
    user_agent: 'ua',
    auth_session_id: `auth-${id}`,
    started_at: '2026-10-13T10:00:00Z',
    last_activity_at: '2026-10-13T10:05:00Z',
    is_current: isCurrent,
  };
}

describe('DevicesPanel — sessão atual pelo JWT', () => {
  beforeEach(() => {
    state.devices = [dispositivo];
    state.sessions = [];
    state.loading = false;
    state.currentDeviceId = 'dev-1';
  });

  it('duas sessões no mesmo aparelho: um único selo "Sessão atual"', () => {
    state.sessions = [sessao('s1', true), sessao('s2', false)];

    render(<DevicesPanel />);

    expect(screen.getAllByText('Sessão atual')).toHaveLength(1);
    // A outra sessão continua podendo ser encerrada.
    expect(screen.getAllByText('Encerrar')).toHaveLength(1);
  });

  it('nenhuma sessão marcada como atual: nenhum selo, todas encerráveis', () => {
    state.sessions = [sessao('s1', false), sessao('s2', false)];

    render(<DevicesPanel />);

    expect(screen.queryByText('Sessão atual')).toBeNull();
    expect(screen.getAllByText('Encerrar')).toHaveLength(2);
  });
});
