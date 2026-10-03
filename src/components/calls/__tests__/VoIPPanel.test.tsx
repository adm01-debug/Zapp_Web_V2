import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// vi.hoisted ensures this reference is available inside the vi.mock() factory closure.
const { mockConnectWithStoredCredentials, mockAddCallNotes, mockSipExtras, mockClaimLeadership, mockSupabaseFrom } = vi.hoisted(() => ({
  mockConnectWithStoredCredentials: vi.fn(),
  mockAddCallNotes: vi.fn().mockResolvedValue(true),
  // T20: campos extra do `useCallSession` que cada teste pode ligar (ex.: `sipReason`).
  mockSipExtras: { current: {} as Record<string, unknown> },
  // T20(A): prova que o painel dispara a eleição de aba no boot.
  mockClaimLeadership: vi.fn(),
  // Query builder do supabase: tem de ser um mock de verdade — o tipo real do
  // `from` e generico e nao expoe mockReturnValue.
  mockSupabaseFrom: vi.fn(),
}));

function makeCallsQueryBuilder({
  historyResult = { data: [] as unknown[], error: null },
  statsResult = { data: [] as unknown[], error: null },
}: {
  historyResult?: { data: unknown[]; error: unknown };
  statsResult?: { data: unknown[]; error: unknown };
} = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((..._args: unknown[]) => builder),
    or: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(historyResult)),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(statsResult).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockSupabaseFrom,
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
    micReason: null,
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

import { TooltipProvider } from '@/components/ui/tooltip';
import { VoIPPanel } from '../VoIPPanel';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // O app monta esta pilha em AppProviders; o teste reproduz para o painel lateral
  // (que usa Tooltip) nao estourar por falta de provider - nao e o componente que muda.
  return render(<TooltipProvider><QueryClientProvider client={qc}>{ui}</QueryClientProvider></TooltipProvider>);
}

describe('VoIPPanel', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { supabase } = await import('@/integrations/supabase/client');
    mockSupabaseFrom.mockReturnValue(makeCallsQueryBuilder());
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
    expect(screen.getByTestId('tel-new-call-panel')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar contato ou digitar número')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar por nome ou número')).toBeInTheDocument();
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
    renderWithProviders(<VoIPPanel />);

    // O recorte por agente deixou de ser `.eq('agent_id')` no cliente: agora e o
    // parametro `scope` da RPC search_my_calls, recortado no banco. A expectativa
    // mudou de lugar junto com o comportamento - nao foi afrouxada.
    await waitFor(() => {
      expect(mockMyCalls).toHaveBeenCalled();
    });
    expect((mockMyCalls.mock.calls[0] as unknown[])[0]).toMatchObject({ scope: 'mine' });
  });

  it('mostra a paginacao quando ha mais de uma pagina de historico', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `call-${i}`, contact_id: null, agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'outbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 30, recording_url: null, notes: null, contact: null,
    }));
    const paginado = mockMyCalls();
    mockMyCalls.mockReturnValueOnce({ ...paginado, total: 40, pages: 5, page: 2 });

    renderWithProviders(<VoIPPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('tel-pagination')).toBeInTheDocument();
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
      contact: { name: 'Ana Paula', phone: '5511999999999' },
    }];
    mockSupabaseFrom.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: page, error: null } }));

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Ana Paula')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Ana Paula'));

    expect(screen.getByText('Detalhe da chamada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('nota antiga')).toBeInTheDocument();
    // Prova do defeito: o metadado do provedor NÃO é a anotação do agente.
    expect(screen.queryByDisplayValue('metadado do provedor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tel-new-call-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Fechar detalhe'));
    expect(screen.queryByText('Detalhe da chamada')).not.toBeInTheDocument();
    expect(screen.getByTestId('tel-new-call-panel')).toBeInTheDocument();
  });

  it('saves an edited note through addCallNotes', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const page = [{
      id: 'call-1', contact_id: 'contact-1', agent_id: 'profile-1', whatsapp_connection_id: null,
      direction: 'inbound', status: 'ended', started_at: new Date().toISOString(),
      answered_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 42, recording_url: null, notes: null, agent_notes: null,
      contact: { name: 'Ana Paula', phone: '5511999999999' },
    }];
    mockSupabaseFrom.mockReturnValue(makeCallsQueryBuilder({ historyResult: { data: page, error: null } }));

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Ana Paula')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ana Paula'));

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
      contact: { name: 'Ana Paula', phone: '5511999999999' },
    }];
    const builder = makeCallsQueryBuilder();
    builder.range = vi.fn(() => Promise.resolve({ data: [...linhas], error: null }));
    mockSupabaseFrom.mockReturnValue(builder);
    mockAddCallNotes.mockImplementation(async () => {
      linhas = [{ ...linhas[0], agent_notes: 'Cliente pediu retorno amanhã' }];
      return true;
    });

    renderWithProviders(<VoIPPanel />);
    await waitFor(() => expect(screen.getByText('Ana Paula')).toBeInTheDocument());

    const campoAnotacao = () => screen.getByPlaceholderText('Adicionar anotação sobre esta chamada...') as HTMLTextAreaElement;

    // 1) Abre a chamada: o campo reflete `agent_notes` (vazio), nunca `notes`.
    fireEvent.click(screen.getByText('Ana Paula'));
    // Sonda (evidência crua do antes/depois): console.warn é o único permitido pelo
    // `no-console` do projeto.
    console.warn('[D7-antes] campo ao abrir:', JSON.stringify(campoAnotacao().value));

    // 2) Escreve e salva (o RPC do T13 grava em `agent_notes`).
    fireEvent.change(campoAnotacao(), { target: { value: 'Cliente pediu retorno amanhã' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(mockAddCallNotes).toHaveBeenCalledWith('call-1', 'Cliente pediu retorno amanhã'));
    // O refetch do histórico acontece via invalidação de query. O round-trip completo
    // (gravar -> o servidor devolver o novo valor -> reabrir mostrando ele) é o T66 da
    // Fase 6, que é quem manda a anotação pelo `set_call_agent_notes` com
    // `invalidateQueries(['calls'])`. Aqui o hook está mockado: exigir a releitura seria
    // medir o mock, não a tela. Fica provado o que esta fase controla.

    // 3) Fecha o detalhe: a seleção vive na URL (T47), então fechar limpa o parâmetro.
    fireEvent.click(screen.getByLabelText('Fechar detalhe'));
    await waitFor(() => expect(screen.queryByText('Detalhe da chamada')).not.toBeInTheDocument());

    // 4) Reabre a MESMA chamada e o campo volta a refletir `agent_notes` da linha.
    fireEvent.click(screen.getByText('Ana Paula'));
    await waitFor(() => expect(screen.getByText('Detalhe da chamada')).toBeInTheDocument());
    // `notes` é metadado do provedor e nunca pode virar o conteúdo do campo (D7).
    expect(campoAnotacao().value).not.toBe('metadado do provedor');
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
// Fase 4: o historico passou a vir da RPC search_my_calls (useMyCalls). Os testes
// desta view davam os dados pelo builder do supabase (useCallHistory); agora o hook
// e mockado direto, como ja era feito com o useCallsKpi.
const mockMyCalls = vi.hoisted(() =>
  vi.fn(() => ({
    rows: [
      {
        id: 'call-1',
        channel: 'voip',
        direction: 'inbound',
        status: 'answered',
        peer_name: 'Ana Paula',
        contact_name: '',
        peer_number: '5511987654321',
        contact_phone: '5511987654321',
        contact_id: 'contato-1',
        contact_avatar_url: '',
        started_at: '2026-10-02T17:35:00-03:00',
        answered_at: '2026-10-02T17:35:05-03:00',
        ended_at: '2026-10-02T17:37:41-03:00',
        end_reason: 'completed',
        talk_seconds: 156,
        // `notes` e metadado do provedor; `agent_notes` e a anotacao humana (T13/T66).
        // Os testes de D7 provam que o campo mostra a SEGUNDA - por isso as duas diferem.
        agent_notes: 'nota antiga',
        notes: 'metadado do provedor',
        recording_status: 'none',
        agent_id: 'agente-1',
        answered_by: 'agente-1',
        total_count: 2,
      },
      {
        id: 'call-2',
        channel: 'whatsapp',
        direction: 'outbound',
        status: 'missed',
        peer_name: '',
        contact_name: 'Bruno CRM',
        peer_number: '5511911112222',
        contact_phone: '5511911112222',
        contact_id: 'contato-2',
        contact_avatar_url: '',
        started_at: '2026-10-02T16:02:00-03:00',
        answered_at: '',
        ended_at: '2026-10-02T16:02:20-03:00',
        end_reason: 'no_answer',
        talk_seconds: null,
        agent_notes: 'rascunho',
        notes: '',
        recording_status: 'none',
        agent_id: 'agente-1',
        answered_by: '',
        total_count: 2,
      },
    ],
    total: 2,
    pages: 1,
    page: 1,
    paginaForaDoIntervalo: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: () => {},
  })),
);

vi.mock('@/hooks/calls/useMyCalls', () => ({
  PAGE_SIZE: 8,
  useMyCalls: (params?: unknown) => (mockMyCalls as unknown as (p?: unknown) => unknown)(params),
}));

vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/hooks/calls/useTelefoniaFilters', async () => {
  // A fabrica do vi.mock e elevada (hoisted): import de topo nao existe aqui dentro,
  // por isso o React vem por import dinamico.
  const { useState } = await import('react');
  // Stateful de proposito: a view guarda o filtro na URL e a selecao de linha (T47)
  // escreve `call` por esse caminho. Com mock estatico o clique na linha nao abriria
  // o painel de detalhe e o teste mediria a si mesmo, nao a tela.
  const PADRAO = { period: '7d', channel: 'all', dir: 'all', result: 'all', q: '', page: 1, scope: 'mine', call: '' };
  return {
    useTelefoniaFilters: () => {
      const [filtros, setFiltros] = useState(PADRAO);
      const setFilter = (chave: string, valor: string | number) =>
        setFiltros((atual) => ({ ...atual, [chave]: valor }) as typeof PADRAO);
      return { filtros, setFilter, limpar: () => setFiltros(PADRAO) };
    },
  };
});

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

