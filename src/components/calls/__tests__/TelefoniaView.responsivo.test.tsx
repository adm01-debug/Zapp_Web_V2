import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TelefoniaView } from '../TelefoniaView';

/**
 * SL-106 (T77) — responsivo da Telefonia.
 *
 * Dois pontos do titulo, provados no componente REAL:
 *   1. abaixo de 1280 o painel lateral nao existe inline: ele vira `Sheet`, aberto pelo
 *      botao "Nova ligacao" do topRight (e pelo clique na linha);
 *   2. em 390 a tabela de 7 colunas vira a lista `CallRowMobile`.
 *
 * A troca NAO e provada por classe de CSS (string de classe nao prova comportamento): a
 * largura do viewport decide QUAL dos dois ramos e montado, e o que se afirma e o que o
 * usuario ve - o painel inline, o Sheet, a tabela ou os cartoes.
 *
 * A largura e simulada no `matchMedia` (o mesmo caminho do `useIsMobile`, que le
 * `window.innerWidth`): `definirLargura()` responde as consultas de breakpoint e avisa os
 * ouvintes de `change`, como o navegador faz quando a janela muda de tamanho.
 */

const { dispatchStartCall } = vi.hoisted(() => ({ dispatchStartCall: vi.fn() }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall }));

/**
 * Viewport simulado: guarda a largura e os ouvintes registrados em `matchMedia`, para
 * `definirLargura()` poder avisar quem observa o breakpoint (a tela observa o `xl`).
 */
const viewport = vi.hoisted(() => ({
  largura: 1024,
  ouvintes: [] as Array<() => void>,
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    // `(max-width: 1279px)` -> painel em Sheet; `(max-width: 767px)` -> celular.
    matches: /max-width:\s*1279px/.test(query)
      ? viewport.largura < 1280
      : /max-width:\s*767px/.test(query)
        ? viewport.largura < 768
        : false,
    media: query,
    onchange: null,
    addEventListener: (_evento: string, ouvinte: () => void) => {
      viewport.ouvintes.push(ouvinte);
    },
    removeEventListener: (_evento: string, ouvinte: () => void) => {
      viewport.ouvintes = viewport.ouvintes.filter((o) => o !== ouvinte);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

const { LINHAS } = vi.hoisted(() => {
  const linha = (id: string, nome: string, telefone: string, inicio: string, fim: string) => ({
    id,
    channel: 'voip',
    direction: 'outbound',
    status: 'ended',
    started_at: inicio,
    answered_at: inicio,
    ended_at: fim,
    end_reason: null,
    peer_number: telefone,
    peer_name: nome,
    contact_name: null,
    contact_id: null,
    contact_phone: null,
    contact_avatar_url: null,
    agent_id: null,
    agent_notes: null,
    notes: null,
    recording_status: 'none',
    talk_seconds: null,
    total_count: 2,
  });
  return {
    LINHAS: [
      linha('c-fulana', 'Fulana de Tal', '+5511999990001', '2026-10-01T10:00:05.000Z', '2026-10-01T10:01:05.000Z'),
      linha('c-beltrano', 'Beltrano Silva', '+5511999990002', '2026-10-01T11:00:00.000Z', '2026-10-01T11:00:30.000Z'),
    ],
  };
});

vi.mock('@/hooks/calls/useMyCalls', () => ({
  useMyCalls: () => ({
    rows: LINHAS,
    total: 2,
    pages: 1,
    page: 1,
    paginaForaDoIntervalo: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// Mocks de fronteira: o mesmo conjunto de `TelefoniaView.selecao-pagina.test.tsx`
// (menos `useTelefoniaFilters`, que roda de verdade para o `?call=` da URL).
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Agente' }, user: { id: 'u1' } }),
}));
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    sipReason: null, currentNumber: '', status: 'idle',
    dispatch: vi.fn(), dial: vi.fn(), hangup: vi.fn(), openDialer: vi.fn(),
  }),
}));
vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ addCallNotes: vi.fn().mockResolvedValue(true), calls: [], startCall: vi.fn() }),
}));
vi.mock('@/hooks/communication/useMediaElementVolume', () => ({ useMediaElementVolume: () => undefined }));
vi.mock('@/lib/calls/tabLeaderStore', () => ({ claimLeadership: vi.fn(), isLeader: () => true }));
vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));
vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true, reason: null },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false, reason: null },
    linhaWhatsApp: null, rotuloLinhaWhatsApp: '',
  }),
}));
// O PageHeader real le o LayoutContext; aqui ele passa o `topRight` adiante, que e onde
// vive o botao "Nova ligacao" do aceite.
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, topRight }: { title?: string; topRight?: ReactNode }) => (
    <div data-testid="page-header">
      {title}
      <div data-testid="page-header-topright">{topRight}</div>
    </div>
  ),
}));

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

/**
 * Muda a largura do viewport e avisa os ouvintes do breakpoint, como o navegador faria.
 */
const definirLargura = (px: number) => {
  viewport.largura = px;
  viewport.ouvintes.forEach((ouvinte) => ouvinte());
};

const renderNaRota = (rota: string) =>
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[rota]}>
        <TelefoniaView />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  dispatchStartCall.mockReset();
  // Cada teste comeca com a view limpa: sem ouvintes da montagem anterior.
  viewport.ouvintes = [];
  definirLargura(1024);
});

describe('SL-106 — painel vira Sheet abaixo de 1280', () => {
  it('em 1024 o painel nao fica inline: quem existe e o Sheet, aberto pelo topRight', async () => {
    renderNaRota('/telefonia');

    // O painel inline (coluna da grade) nao e montado nesta largura - nem o discador dele.
    expect(screen.queryByTestId('tel-side-panel')).toBeNull();
    expect(screen.queryByTestId('tel-new-call-panel')).toBeNull();

    // Evento do usuario: o botao "Nova ligacao" do topRight.
    fireEvent.click(screen.getByTestId('tel-abrir-painel'));

    const sheet = await screen.findByTestId('tel-side-sheet');
    expect(within(sheet).getByTestId('tel-new-call-panel')).toBeInTheDocument();
    // Um painel por vez: o Sheet e o painel inline nunca coexistem.
    expect(screen.queryByTestId('tel-side-panel')).toBeNull();
  });

  it('em 1440 o painel continua na coluna lateral e o Sheet nao e montado (controle)', () => {
    definirLargura(1440);
    renderNaRota('/telefonia');

    const painel = screen.getByTestId('tel-side-panel');
    expect(within(painel).getByTestId('tel-new-call-panel')).toBeInTheDocument();
    // O botao do Sheet so existe abaixo de 1280; o Sheet nao esta no DOM.
    expect(screen.queryByTestId('tel-abrir-painel')).toBeNull();
    expect(screen.queryByTestId('tel-side-sheet')).toBeNull();
    expect(screen.getByTestId('tel-history-table')).toBeInTheDocument();
  });

  it('selecionar a linha no celular abre o detalhe dentro do Sheet', async () => {
    definirLargura(390);
    renderNaRota('/telefonia');

    expect(screen.queryByTestId('tel-selected-panel')).toBeNull();
    fireEvent.click(within(screen.getByTestId('tel-list-mobile')).getAllByTestId('tel-row-mobile')[0]);

    const sheet = await screen.findByTestId('tel-side-sheet');
    const detalhe = within(sheet).getByTestId('tel-selected-panel');
    // A duração é da linha tocada (Fulana: 10:00:05 -> 10:01:05) — prova que o detalhe
    // que abriu é o DELA, e não o da outra linha.
    expect(detalhe).toHaveTextContent('01:00');
    expect(detalhe).not.toHaveTextContent('00:30');
  });

  it('deep link `?call=` abre o detalhe no Sheet (a largura nao esconde a selecao)', async () => {
    definirLargura(1024);
    renderNaRota('/telefonia?call=c-beltrano');

    const sheet = await screen.findByTestId('tel-side-sheet');
    const detalhe = within(sheet).getByTestId('tel-selected-panel');
    // Beltrano: 11:00:00 -> 11:00:30. Se a largura escondesse a seleção, o Sheet nem
    // existiria; se abrisse a linha errada, a duração seria a da Fulana (01:00).
    expect(detalhe).toHaveTextContent('00:30');
    expect(detalhe).not.toHaveTextContent('01:00');
  });
});

describe('SL-106 — em 390 o historico vira CallRowMobile', () => {
  it('a tabela de 7 colunas da lugar aos cartoes, com contato, duracao e acao', () => {
    definirLargura(390);
    renderNaRota('/telefonia');

    expect(screen.queryByTestId('tel-history-table')).toBeNull();

    const linhas = within(screen.getByTestId('tel-list-mobile')).getAllByTestId('tel-row-mobile');
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent('Fulana de Tal');
    // 10:00:05 -> 10:01:05 = 01:00 (formato mm:ss do `formatClock`).
    expect(linhas[0]).toHaveTextContent('01:00');

    // A acao de ligar de volta e a mesma origem de discagem da tabela.
    fireEvent.click(within(linhas[0]).getByTestId('tel-row-mobile-callback'));
    expect(dispatchStartCall).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+5511999990001', channel: 'voip' }),
    );
  });

  it('em 1440 a tabela continua sendo a lista (controle)', () => {
    definirLargura(1440);
    renderNaRota('/telefonia');

    expect(screen.getByTestId('tel-history-table')).toBeInTheDocument();
    expect(screen.queryByTestId('tel-list-mobile')).toBeNull();
  });

  it('trocar a largura troca lista e painel sem recarregar a view', () => {
    definirLargura(1440);
    renderNaRota('/telefonia');
    expect(screen.getByTestId('tel-side-panel')).toBeInTheDocument();
    expect(screen.getByTestId('tel-history-table')).toBeInTheDocument();

    act(() => definirLargura(390));

    expect(screen.queryByTestId('tel-side-panel')).toBeNull();
    expect(screen.queryByTestId('tel-history-table')).toBeNull();
    expect(screen.getByTestId('tel-list-mobile')).toBeInTheDocument();
    expect(screen.getByTestId('tel-abrir-painel')).toBeInTheDocument();
  });
});
