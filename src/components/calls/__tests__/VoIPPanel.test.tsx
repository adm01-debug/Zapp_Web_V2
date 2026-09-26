// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// vi.hoisted ensures this reference is available inside the vi.mock() factory closure.
const { mockConnectWithStoredCredentials } = vi.hoisted(() => ({ mockConnectWithStoredCredentials: vi.fn() }));

function makeCallsQueryBuilder({ historyResult = { data: [], error: null }, statsResult = { data: [], error: null } } = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(historyResult)),
    then: (resolve, reject) => Promise.resolve(statsResult).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeCallsQueryBuilder()),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' }, user: { id: 'user-1' } }),
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    sipStatus: 'disconnected' as const,
    callStatus: 'idle' as const,
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    callDirection: null,
    currentCallId: null,
    connectWithStoredCredentials: mockConnectWithStoredCredentials,
    disconnect: vi.fn(),
    makeCall: vi.fn(),
    hangUp: vi.fn(),
    acceptIncomingCall: vi.fn(),
    rejectIncomingCall: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
  }),
}));

import { VoIPPanel } from '../VoIPPanel';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('VoIPPanel', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { supabase } = await import('@/integrations/supabase/client');
    supabase.from.mockReturnValue(makeCallsQueryBuilder());
    mockConnectWithStoredCredentials.mockReset();
  });

  it('renders the Telefonia header', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Telefonia')).toBeInTheDocument();
  });

  it('renders only the operator tabs — no admin configuration tab', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Discador')).toBeInTheDocument();
    expect(screen.getByText('Histórico')).toBeInTheDocument();
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
    expect(screen.queryByText('Servidor SIP')).not.toBeInTheDocument();
  });

  it('defaults to dialer tab with number input visible', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByPlaceholderText('Digite o número')).toBeInTheDocument();
  });

  it('can click history tab without crashing', () => {
    renderWithProviders(<VoIPPanel />);
    fireEvent.click(screen.getByText('Histórico'));
    expect(screen.getByText('Histórico')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Recebidas')).toBeInTheDocument();
    expect(screen.getByText('Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Perdidas')).toBeInTheDocument();
    expect(screen.getByText('Duração Média')).toBeInTheDocument();
  });

  it('calculates stats correctly with empty calls', () => {
    renderWithProviders(<VoIPPanel />);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });

  it('scopes both the history and the stats query to the signed-in agent', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const builder = makeCallsQueryBuilder();
    supabase.from.mockReturnValue(builder);

    renderWithProviders(<VoIPPanel />);
    fireEvent.mouseDown(screen.getByText('Histórico'));

    await waitFor(() => {
      expect(builder.eq).toHaveBeenCalledWith('agent_id', 'profile-1');
    });
    // Duas consultas (histórico paginado + agregados) — ambas com o mesmo escopo.
    expect(builder.eq.mock.calls.every(([col, val]) => col === 'agent_id' && val === 'profile-1')).toBe(true);
  });

  it('shows a load-more button only when a full page of history is returned', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `call-${i}`, contact_id: null, agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'outbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 30, recording_url: null, notes: null,
    }));
    supabase.from.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: fullPage, error: null } }));

    renderWithProviders(<VoIPPanel />);
    // Radix TabsTrigger ativa a aba no mousedown, não no click sintético do jsdom.
    fireEvent.mouseDown(screen.getByText('Histórico'));

    await waitFor(() => {
      expect(screen.getByText('Carregar mais')).toBeInTheDocument();
    });
  });

  it('delegates the connect button to the shared call session (credential fetch lives in useSipClient)', async () => {
    renderWithProviders(<VoIPPanel />);
    fireEvent.click(screen.getByRole('button', { name: /conectar sip/i }));
    await waitFor(() => {
      expect(mockConnectWithStoredCredentials).toHaveBeenCalledOnce();
    });
  });
});
