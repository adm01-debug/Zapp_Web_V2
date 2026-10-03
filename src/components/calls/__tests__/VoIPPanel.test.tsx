// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// vi.hoisted ensures this reference is available inside the vi.mock() factory closure.
const { mockConnectWithStoredCredentials, mockAddCallNotes, mockSipExtras, mockClaimLeadership } = vi.hoisted(() => ({
  mockConnectWithStoredCredentials: vi.fn(),
  mockAddCallNotes: vi.fn().mockResolvedValue(true),
  // T20: campos extra do `useCallSession` que cada teste pode ligar (ex.: `sipReason`).
  mockSipExtras: { current: {} as Record<string, unknown> },
  // T20(A): prova que o painel dispara a eleição de aba no boot.
  mockClaimLeadership: vi.fn(),
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
    ...mockSipExtras.current,
  }),
}));

vi.mock('@/lib/calls/tabLeaderStore', () => ({
  claimLeadership: mockClaimLeadership,
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
    mockSipExtras.current = {};
    mockClaimLeadership.mockReset();
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

  it('renders KPI tiles com os numeros do servidor (T38/T39)', () => {
    // Antes esta prova cobria os cards antigos da tela, que liam statsRows do
    // useCallHistory. Os KPIs do plano vem da RPC my_calls_kpi, entao a expectativa
    // foi repontada para os tiles novos - e ficou MAIS FORTE: antes so existia o
    // rotulo, agora o valor real aparece na tela.
    renderWithProviders(<VoIPPanel />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Atendidas')).toBeInTheDocument();
    expect(screen.getByText('Perdidas')).toBeInTheDocument();
    expect(screen.getByText('Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Tempo medio')).toBeInTheDocument();
    // Pelos testid e na ORDEM dos tiles: getByText colide com numero do historico
    // (um '8' de duracao, por exemplo). Aqui os 5 valores do servidor sao exatos.
    expect(screen.getAllByTestId('tel-kpi-value').map((e) => e.textContent)).toEqual([
      '12', '8', '2', '3', '3:10',
    ]);
    expect(screen.getAllByTestId('tel-kpi-card').length).toBe(5);
  });

  it('mostra os tiles com altura fixa de 78px (T38)', () => {
    renderWithProviders(<VoIPPanel />);
    const tiles = screen.getAllByTestId('tel-kpi-card');
    expect(tiles.length).toBe(5);
    tiles.forEach((t) => expect(t.className).toContain('h-[78px]'));
  });

  it('os KPIs sao os mesmos 5 tiles, sem fileira duplicada de numeros (T38/T39)', () => {
    renderWithProviders(<VoIPPanel />);
    // A tela tinha OUTRA fileira de stats (Total/Recebidas/... lendo useCallHistory).
    // Duas fileiras com os mesmos numeros seria bug; o valor do servidor aparece uma vez.
    expect(screen.getAllByTestId('tel-kpi-card').length).toBe(5);
    const valores = screen.getAllByTestId('tel-kpi-value').map((e) => e.textContent);
    expect(valores.filter((x) => x === '12').length).toBe(1);
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

  

  // T20(A): a eleição de aba líder tem de COMEÇAR no boot do painel — sem esta
  // reivindicação nenhuma aba assume e o portão de `connect()` (useSipConnection)
  // recusaria o REGISTER em todas elas (a telefonia nunca registraria a linha).
  it('T20: reivindica a liderança da aba ao montar (a eleição começa)', () => {
    renderWithProviders(<VoIPPanel />);

    expect(mockClaimLeadership).toHaveBeenCalled();
  });

  // T20: o painel repassa o motivo da linha (vindo de useCallSession/useSipClient)
  // ao DialPad — a aba que não é dona do registro mostra o motivo e não oferece conectar.
  it('T20: com sipReason=line_in_use_other_tab mostra o motivo e desabilita conectar', () => {
    mockSipExtras.current = { sipReason: 'line_in_use_other_tab' };

    renderWithProviders(<VoIPPanel />);

    expect(screen.getByText('Ligação em andamento em outra aba')).toBeInTheDocument();
    // T40: o botao foi removido da tela; a prova agora afirma a AUSENCIA (o inverso),
    // em vez de ser apagada - apagar a expectativa esconderia a regressao.
    expect(screen.queryByText('Conectar SIP')).toBeNull();
    expect(screen.queryByText('Desconectar')).toBeNull();
  });
});
vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/hooks/calls/useTelefoniaFilters', () => ({
  useTelefoniaFilters: () => ({
    filtros: { period: '7d', channel: 'all', dir: 'all', result: 'all', q: '', page: 1, scope: 'mine', call: '' },
    setFilter: () => {},
    limpar: () => {},
  }),
}));

// T34: o PageHeader le o LayoutContext (breadcrumbs) e estoura sem o provider. Mockar
// AQUI e o passo que faltou na primeira tentativa: sem isso, os 13 testes da view caiam.
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title?: string; subtitle?: string }) => (
    <div data-testid="page-header">
      {title}
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

