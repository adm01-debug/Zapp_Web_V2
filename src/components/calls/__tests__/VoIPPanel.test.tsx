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
    sipStatus: 'idle' as const,
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
    // T16 (D7): a linha traz as DUAS colunas, como o banco devolve hoje —
    // `notes` é metadado do provedor (T66) e `agent_notes` é a anotação humana
    // (T13, gravada por `set_call_agent_notes`). O campo tem de mostrar a segunda.
    const page = [{
      id: 'call-1', contact_id: 'contact-1', agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'inbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 42, recording_url: null,
      notes: 'metadado do provedor', agent_notes: 'nota antiga',
      contact: { name: 'Maria Souza', phone: '5511999999999' },
    }];
    supabase.from.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: page, error: null } }));

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Maria Souza'));

    expect(screen.getByText('Detalhe da chamada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('nota antiga')).toBeInTheDocument();
    // Prova do defeito: o metadado do provedor NÃO é a anotação do agente.
    expect(screen.queryByDisplayValue('metadado do provedor')).not.toBeInTheDocument();
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
      duration_seconds: 42, recording_url: null, notes: null, agent_notes: null,
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

  /**
   * T16 (D7) — o ciclo que a auditoria mediu num probe de componente: salvar →
   * fechar → reabrir a MESMA chamada deixava o campo VAZIO. Duas causas: o
   * painel lia `notes` (metadado do provedor, T66) em vez de `agent_notes`
   * (onde o T13 grava) e o histórico não era invalidado depois do save.
   *
   * Aqui a "linha do banco" começa sem anotação e o RPC passa a devolvê-la
   * gravada em `agent_notes` — é a assimetria real entre a escrita do T13 e a
   * leitura da UI.
   */
  it('D7: a anotação salva em `agent_notes` reaparece ao fechar e reabrir a mesma chamada', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    let linhas = [{
      id: 'call-1', contact_id: 'contact-1', agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'inbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 42, recording_url: null,
      notes: 'metadado do provedor', agent_notes: null as string | null,
      contact: { name: 'Maria Souza', phone: '5511999999999' },
    }];
    const builder = makeCallsQueryBuilder();
    builder.range = vi.fn(() => Promise.resolve({ data: [...linhas], error: null }));
    supabase.from.mockReturnValue(builder);
    mockAddCallNotes.mockImplementation(async () => {
      linhas = [{ ...linhas[0], agent_notes: 'Cliente pediu retorno amanhã' }];
      return true;
    });

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument());

    const campoAnotacao = () => screen.getByPlaceholderText('Adicionar anotação sobre esta chamada...') as HTMLTextAreaElement;

    // 1) Abre a chamada: o campo reflete `agent_notes` (vazio), nunca `notes`.
    fireEvent.click(screen.getByText('Maria Souza'));
    // Sonda (evidência crua do antes/depois): console.warn é o único permitido pelo
    // `no-console` do projeto.
    console.warn('[D7-antes] campo ao abrir:', JSON.stringify(campoAnotacao().value));

    // 2) Escreve e salva (o RPC do T13 grava em `agent_notes`).
    fireEvent.change(campoAnotacao(), { target: { value: 'Cliente pediu retorno amanhã' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(mockAddCallNotes).toHaveBeenCalledWith('call-1', 'Cliente pediu retorno amanhã'));
    // O save invalida o histórico → a linha do banco é relida já com a anotação.
    await waitFor(() => expect(builder.range.mock.calls.length).toBeGreaterThanOrEqual(2));

    // 3) Fecha o detalhe e reabre a MESMA chamada.
    fireEvent.click(screen.getByLabelText('Fechar detalhe'));
    expect(screen.queryByText('Detalhe da chamada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Maria Souza'));

    console.warn('[D7-depois] campo ao reabrir:', JSON.stringify(campoAnotacao().value));
    expect(campoAnotacao().value).toBe('Cliente pediu retorno amanhã');
  });

  it('delegates the connect button to the shared call session (credential fetch lives in useSipClient)', async () => {
    renderWithProviders(<VoIPPanel />);
    fireEvent.click(screen.getByRole('button', { name: /conectar sip/i }));
    await waitFor(() => {
      expect(mockConnectWithStoredCredentials).toHaveBeenCalledOnce();
    });
  });
});
