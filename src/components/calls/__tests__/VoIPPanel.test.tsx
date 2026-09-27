// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// vi.hoisted ensures this reference is available inside the vi.mock() factory closure.
const { mockConnectWithStoredCredentials, mockAddCallNotes } = vi.hoisted(() => ({
  mockConnectWithStoredCredentials: vi.fn(),
  mockAddCallNotes: vi.fn().mockResolvedValue(true),
}));

function makeCallsQueryBuilder({ historyResult = { data: [], error: null }, statsResult = { data: [], error: null } } = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({
    startCall: vi.fn(),
    answerCall: vi.fn(),
    endCall: vi.fn(),
    missCall: vi.fn(),
    addCallNotes: mockAddCallNotes,
    getContactCalls: vi.fn(),
    currentCallId: null,
    isLoading: false,
  }),
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
    mockAddCallNotes.mockReset().mockResolvedValue(true);
  });

  it('renders the Telefonia header', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Telefonia')).toBeInTheDocument();
  });

  it('shows history and the dialer side by side — no admin configuration tab', () => {
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByPlaceholderText('Digite o número')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar por nome ou telefone...')).toBeInTheDocument();
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
    expect(screen.queryByText('Servidor SIP')).not.toBeInTheDocument();
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
      duration_seconds: 30, recording_url: null, notes: null, contact: null,
    }));
    supabase.from.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: fullPage, error: null } }));

    renderWithProviders(<VoIPPanel />);

    await waitFor(() => {
      expect(screen.getByText('Carregar mais')).toBeInTheDocument();
    });
  });

  it('opens the call detail panel on row click and hides the dialer', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const page = [{
      id: 'call-1', contact_id: 'contact-1', agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'inbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 42, recording_url: null, notes: 'nota antiga',
      contact: { name: 'Maria Souza', phone: '5511999999999' },
    }];
    supabase.from.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: page, error: null } }));

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Maria Souza'));

    expect(screen.getByText('Detalhe da chamada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('nota antiga')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Digite o número')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Fechar detalhe'));
    expect(screen.queryByText('Detalhe da chamada')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite o número')).toBeInTheDocument();
  });

  it('saves an edited note through addCallNotes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const page = [{
      id: 'call-1', contact_id: 'contact-1', agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'inbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 42, recording_url: null, notes: null,
      contact: { name: 'Maria Souza', phone: '5511999999999' },
    }];
    supabase.from.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: page, error: null } }));

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Maria Souza'));

    fireEvent.change(screen.getByPlaceholderText('Adicionar anotação sobre esta chamada...'), {
      target: { value: 'Cliente pediu retorno amanhã' },
    });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(mockAddCallNotes).toHaveBeenCalledWith('call-1', 'Cliente pediu retorno amanhã');
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
