import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockUseCallSession, mockCurrentView } = vi.hoisted(() => ({
  mockUseCallSession: vi.fn(),
  mockCurrentView: vi.fn(),
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => mockUseCallSession(),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  useNavigationHistory: () => ({ currentView: mockCurrentView() }),
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
    session: { status: 'active', channel: 'voip', phone: '5511999999999', name: null },
    acceptIncomingCall: vi.fn(),
    toggleMute: vi.fn(),
    hangUp: vi.fn(),
    ...overrides,
  };
}

function renderAt(view: string) {
  mockCurrentView.mockReturnValue(view);
  return render(<ActiveCallBar />);
}

describe('ActiveCallBar', () => {
  beforeEach(() => {
    mockUseCallSession.mockReset();
    mockCurrentView.mockReset();
  });

  it('renders nothing when there is no active call', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'idle' }));
    renderAt('inbox');
    expect(screen.queryByLabelText('Encerrar')).not.toBeInTheDocument();
  });

  it('renders nothing while already on the Telefonia screen', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', currentNumber: '5511999999999' }));
    renderAt('voip');
    expect(screen.queryByLabelText('Encerrar')).not.toBeInTheDocument();
  });

  it('shows the bar with mute/hangup during an active call on another screen', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', currentNumber: '5511999999999', callDuration: 65 }));
    renderAt('inbox');
    expect(screen.getByText('5511999999999')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByLabelText('Silenciar')).toBeInTheDocument();
    expect(screen.getByLabelText('Encerrar')).toBeInTheDocument();
  });

  it('shows accept instead of mute for a ringing inbound call', () => {
    const session = baseSession({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    mockUseCallSession.mockReturnValue(session);
    renderAt('inbox');

    expect(screen.getByLabelText('Atender')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Atender'));
    expect(session.acceptIncomingCall).toHaveBeenCalledOnce();
  });



  it('T69: e uma faixa de 48px no topo, nao mais um cartao flutuante', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', callDuration: 65, currentNumber: '5511999999999' }));
    renderAt('inbox');
    const faixa = screen.getByTestId('tel-active-bar');
    expect(faixa.className).toContain('h-12');
    expect(faixa.className).toContain('shrink-0');
    // O flutuante saiu de proposito (T69): nada de fixed/bottom neste componente.
    expect(faixa.className).not.toContain('fixed');
    expect(faixa.className).not.toContain('bottom-');
  });

  it('T69: o clique na faixa leva para o painel da telefonia', () => {
    mockUseCallSession.mockReturnValue(baseSession({ callStatus: 'active', callDuration: 65, currentNumber: '5511999999999' }));
    renderAt('inbox');
    fireEvent.click(screen.getByLabelText('Abrir a chamada em curso na telefonia'));
    expect(window.location.search).toContain('view=voip');
  });
});
