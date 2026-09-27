import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockUseCallSession } = vi.hoisted(() => ({ mockUseCallSession: vi.fn() }));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => mockUseCallSession(),
}));

import { ActiveCallBar } from '../ActiveCallBar';

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    sipStatus: 'registered',
    callStatus: 'idle',
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    callDirection: null,
    acceptIncomingCall: vi.fn(),
    toggleMute: vi.fn(),
    hangUp: vi.fn(),
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveCallBar />
    </MemoryRouter>,
  );
}

describe('ActiveCallBar', () => {
  beforeEach(() => {
    mockUseCallSession.mockReset();
  });

  it('renders nothing when there is no active call', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'idle' }));
    renderAt('/?view=inbox');
    expect(screen.queryByLabelText('Encerrar')).not.toBeInTheDocument();
  });

  it('renders nothing while already on the Telefonia screen', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', currentNumber: '5511999999999' }));
    renderAt('/?view=voip');
    expect(screen.queryByLabelText('Encerrar')).not.toBeInTheDocument();
  });

  it('shows the bar with mute/hangup during an active call on another screen', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', currentNumber: '5511999999999', callDuration: 65 }));
    renderAt('/?view=inbox');
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByLabelText('Silenciar')).toBeInTheDocument();
    expect(screen.getByLabelText('Encerrar')).toBeInTheDocument();
  });

  it('shows accept instead of mute for a ringing inbound call', () => {
    const session = baseSession({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    mockUseCallSession.mockReturnValue(session);
    renderAt('/?view=inbox');

    expect(screen.getByLabelText('Atender')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Atender'));
    expect(session.acceptIncomingCall).toHaveBeenCalledOnce();
  });
});
