import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TelefoniaView } from '../TelefoniaView';

/**
 * R2-MOD-014 (#394) — selecionar uma chamada fora da primeira pagina.
 *
 * DEFEITO (auditoria, useTelefoniaFilters.ts:61-74): `setFilter` resetava `page` para 1 em
 * qualquer chave diferente de `page`, inclusive `call` — o parametro do DETALHE. Como o
 * detalhe e derivado de `historicos.rows` da pagina consultada (TelefoniaView:142), escolher
 * uma chamada da pagina 3 jogava a lista de volta para a 1 e o painel de detalhe nem abria.
 *
 * PROVA: o componente REAL e montado direto na pagina 3, com a linha da pagina 3 (id
 * `call-da-pagina-3`) e a da pagina 1 (id `call-da-pagina-1`) com ids e numeros DIFERENTES.
 * O clique e o evento do usuario. Sem a correcao, a lista cai para a 1, o id clicado nao
 * existe mais entre as linhas e o detalhe nao abre.
 */

const { linha, LISTA } = vi.hoisted(() => {
  const LISTA = {
    1: { id: 'call-da-pagina-1', telefone: '+5511911112222', rotulo: '91111-2222' },
    3: { id: 'call-da-pagina-3', telefone: '+5511977776666', rotulo: '97777-6666' },
  };
  const linha = (id: string, telefone: string) => ({
    id,
    channel: 'voip',
    direction: 'outbound',
    status: 'ended',
    started_at: '2026-10-01T10:00:00.000Z',
    answered_at: '2026-10-01T10:00:05.000Z',
    ended_at: '2026-10-01T10:01:05.000Z',
    end_reason: null,
    peer_number: telefone,
    peer_name: null,
    contact_name: null,
    contact_id: null,
    contact_phone: null,
    agent_id: null,
    agent_notes: null,
    notes: null,
    recording_status: 'none',
    total_count: 24,
  });
  return { linha, LISTA };
});

// useMyCalls REAL responde pelo `page` do filtro da URL: e ele que mostra se a pagina mudou.
// 24 registros / PAGE_SIZE 8 = 3 paginas.
vi.mock('@/hooks/calls/useMyCalls', () => ({
  useMyCalls: ({ page }: { page: number }) => {
    const daVez = page === 3 ? LISTA[3] : LISTA[1];
    return {
      rows: [linha(daVez.id, daVez.telefone)],
      total: 24,
      pages: 3,
      page,
      paginaForaDoIntervalo: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
}));

// Mocks de fronteira (mesmo conjunto do TelefoniaView.test.tsx — nao inclui
// `useTelefoniaFilters`, que e o hook sob prova: aqui ele roda de verdade).
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
  useCalls: () => ({ addCallNotes: vi.fn().mockResolvedValue(undefined), calls: [], startCall: vi.fn() }),
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
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title }: { title?: string }) => <div data-testid="page-header">{title}</div>,
}));

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

const renderNaRota = (rota: string) =>
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[rota]}>
        <TelefoniaView />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** O botao da paginacao (o dial pad tambem tem botoes "1", "2", "3"). */
const botaoDaPagina = (n: number) => within(screen.getByTestId('tel-pagination')).getByRole('button', { name: String(n) });

describe('TelefoniaView — selecionar chamada fora da primeira pagina (R2-MOD-014)', () => {
  it('selecionar a chamada da pagina 3 mantem a pagina e abre o detalhe dela', async () => {
    renderNaRota('/telefonia?page=3');

    // Estado A: estamos na pagina 3, com a linha DELA visivel e nenhum detalhe aberto.
    expect(botaoDaPagina(3)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('tel-row')).toHaveTextContent(LISTA[3].rotulo);
    expect(screen.queryByTestId('tel-selected-panel')).toBeNull();

    // Evento do usuario: clique na linha da pagina 3.
    fireEvent.click(screen.getByTestId('tel-row'));

    // A lista continua na pagina 3 (nao voltou para a 1)...
    expect(botaoDaPagina(3)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('tel-row')).toHaveTextContent(LISTA[3].rotulo);
    // ...e o detalhe da chamada DAQUELA pagina (id ausente na pagina 1) abre.
    const painel = await screen.findByTestId('tel-selected-panel');
    expect(painel).toHaveTextContent(LISTA[3].telefone);
  });

  it('selecionar a chamada da pagina 1 continua funcionando (controle)', async () => {
    renderNaRota('/telefonia?page=1');

    expect(botaoDaPagina(1)).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByTestId('tel-row'));

    expect(botaoDaPagina(1)).toHaveAttribute('aria-current', 'page');
    const painel = await screen.findByTestId('tel-selected-panel');
    expect(painel).toHaveTextContent(LISTA[1].telefone);
  });
});
