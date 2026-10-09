import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X081 (TL-117) — filtros da Visão geral, grade e ⟳.
 *
 * O que esta prova cobre (a barra da Visão geral sobre o `TalkXFilterBar`):
 * 1. os selects com os rótulos que o cartão pede — inclusive "Todos os canais",
 *    que não existia e cujas opções saem de `TALKX_CHANNELS` (A15: só WhatsApp);
 * 2. o filtro de canal é aplicado de verdade: o canal real (WhatsApp) não
 *    descarta nada e um valor fora da lista de canais não casa (vazio filtrado);
 * 3. o chip de período consome o recorte — "7 dias" corta a LISTA e os KPIs;
 * 4. o ⟳ refaz a consulta (o mesmo `onRetry` que destrava o erro) e gira
 *    enquanto a promessa não resolve, soltando o giro também no erro;
 * 5. a alternância lista/grade fica gravada em `talkx.overview.layout` e
 *    sobrevive a remontar a tela;
 * 6. o vazio filtrado oferece "Limpar filtros" e o clique limpa os filtros.
 */

const f = vi.hoisted(() => ({
  insights: undefined as unknown,
}));

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: f.insights, isLoading: false, isError: false, error: null }),
}));

import { TalkXOverview } from '../TalkXOverview';
import { TALKX_CHANNELS } from '../kit/constants';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const HOJE = new Date('2026-10-09T12:00:00.000Z');

function campanha(over: Partial<TalkXCampaign> & { id: string; name: string }): TalkXCampaign {
  return {
    message_template: 'Oi {{nome}}',
    variables_config: [],
    typing_delay_min: 1,
    typing_delay_max: 2,
    send_interval_min: 1,
    send_interval_max: 2,
    status: 'completed',
    total_recipients: 20,
    sent_count: 18,
    failed_count: 2,
    delivered_count: 18,
    whatsapp_connection_id: 'w1',
    created_by: 'u1',
    started_at: '2026-10-08T10:00:00.000Z',
    completed_at: '2026-10-08T11:00:00.000Z',
    created_at: '2026-10-08T09:00:00.000Z',
    updated_at: '2026-10-08T11:00:00.000Z',
    media_url: null,
    media_type: null,
    scheduled_at: null,
    description: '',
    objective: 'engajamento',
    segment_id: null,
    ...over,
  } as unknown as TalkXCampaign;
}

/** Recente (dentro de 7 dias de HOJE) e antiga (fora). */
const recente = campanha({ id: 'c-recente', name: 'Campanha recente' });
const antiga = campanha({
  id: 'c-antiga',
  name: 'Campanha antiga',
  started_at: '2026-09-01T10:00:00.000Z',
  completed_at: '2026-09-01T11:00:00.000Z',
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-01T11:00:00.000Z',
});

const baseProps = {
  campaigns: [recente, antiga] as TalkXCampaign[],
  segments: [],
  creators: {},
  isLoading: false,
  onNew: vi.fn(),
  onEdit: vi.fn(),
  onView: vi.fn(),
  onDuplicate: vi.fn(),
  onStart: vi.fn(),
  onPause: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onGoTab: vi.fn(),
};

/** Abre um select real da barra (Radix) e escolhe a opção. */
function escolher(rotuloDoSelect: string, opcao: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: rotuloDoSelect }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

/** Valor impresso no KPI, lido do card real. */
function kpi(rotulo: string): string {
  const card = screen.getAllByTestId('kpi-card').find((el) => el.textContent?.includes(rotulo));
  return card?.textContent ?? '';
}

function botaoAtualizar(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Atualizar' }) as HTMLButtonElement;
}

describe('X081 · filtros da Visão geral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.insights = undefined;
    sessionStorage.clear();
    localStorage.clear();
    // Só o relógio é falso: o recorte de período depende da data, e os timers
    // reais continuam servindo o Radix e o debounce da busca.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('mostra os selects do cartão, com as opções de canal de TALKX_CHANNELS', () => {
    render(<TalkXOverview {...baseProps} />);

    for (const rotulo of ['Todos os status', 'Todos os canais', 'Todos os segmentos', 'Todos os criadores']) {
      expect(screen.getByRole('combobox', { name: rotulo })).toBeTruthy();
    }

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Todos os canais' }), {
      button: 0, ctrlKey: false, pointerType: 'mouse',
    });
    expect(screen.getByRole('option', { name: 'Todos os canais' })).toBeTruthy();
    for (const canal of TALKX_CHANNELS) {
      expect(screen.getByRole('option', { name: canal.label })).toBeTruthy();
    }
  });

  it('canal: escolher o canal real (WhatsApp) mantém a lista; valor fora da lista não casa', () => {
    const { unmount } = render(<TalkXOverview {...baseProps} />);
    // O nome da campanha aparece na tabela e no rail "Últimas campanhas".
    expect(screen.getAllByText('Campanha recente').length).toBeGreaterThan(0);

    escolher('Todos os canais', 'WhatsApp');
    // A15: só existe WhatsApp — o filtro é aplicado e não descarta campanha nenhuma.
    expect(screen.getAllByText('Campanha recente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Campanha antiga').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: 'Todos os canais' }).textContent).toContain('WhatsApp');
    unmount();

    // Sem coluna de canal, um valor que não existe (sessão antiga) não casa nada:
    // a tabela some e dá lugar ao vazio filtrado (o rail "Últimas campanhas" é
    // uma seção própria e segue com a lista das últimas).
    sessionStorage.setItem('talkx.overview.filters', JSON.stringify({ channel: 'email' }));
    render(<TalkXOverview {...baseProps} />);
    expect(screen.getByText('Nenhum resultado encontrado')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('período: "7 dias" corta a lista E os KPIs', () => {
    render(<TalkXOverview {...baseProps} />);
    expect(kpi('Total de campanhas')).toContain('2');

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '7 dias' }));

    expect(screen.getAllByText('Campanha recente').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Campanha antiga')).toHaveLength(0);
    expect(kpi('Total de campanhas')).toContain('1');
  });

  it('⟳ refaz a consulta e gira enquanto ela não volta (e solta o giro no fim)', async () => {
    let resolver: () => void = () => {};
    const onRetry = vi.fn(() => new Promise<void>((res) => { resolver = res; }));

    render(<TalkXOverview {...baseProps} onRetry={onRetry} />);
    expect(botaoAtualizar().disabled).toBe(false);
    expect(botaoAtualizar().querySelector('svg')?.classList.contains('animate-spin')).toBe(false);

    fireEvent.click(botaoAtualizar());

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(botaoAtualizar().disabled).toBe(true);
    expect(botaoAtualizar().querySelector('svg')?.classList.contains('animate-spin')).toBe(true);

    await act(async () => { resolver(); });

    await waitFor(() => expect(botaoAtualizar().disabled).toBe(false));
    expect(botaoAtualizar().querySelector('svg')?.classList.contains('animate-spin')).toBe(false);
  });

  it('⟳ solta o giro quando a consulta falha (o erro é do boundary)', async () => {
    let rejeitar: (e: Error) => void = () => {};
    const onRetry = vi.fn(() => new Promise<void>((_res, rej) => { rejeitar = rej; }));

    render(<TalkXOverview {...baseProps} onRetry={onRetry} />);
    fireEvent.click(botaoAtualizar());
    expect(botaoAtualizar().disabled).toBe(true);

    await act(async () => { rejeitar(new Error('falha de rede')); });

    await waitFor(() => expect(botaoAtualizar().disabled).toBe(false));
  });

  it('sem onRetry o ⟳ não é oferecido ligado (botão desabilitado, sem promessa falsa)', () => {
    render(<TalkXOverview {...baseProps} />);
    expect(botaoAtualizar().disabled).toBe(true);
  });

  it('lista/grade: a escolha fica gravada em talkx.overview.layout e sobrevive ao remontar', () => {
    const { unmount } = render(<TalkXOverview {...baseProps} />);
    expect(screen.getByTitle('Lista').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTitle('Grade'));
    expect(screen.getByTitle('Grade').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('talkx.overview.layout')).toBe('grid');
    unmount();

    render(<TalkXOverview {...baseProps} />);
    expect(screen.getByTitle('Grade').getAttribute('aria-pressed')).toBe('true');
  });

  it('vazio filtrado oferece "Limpar filtros" e o clique devolve a lista', () => {
    sessionStorage.setItem('talkx.overview.filters', JSON.stringify({ status: 'cancelled', objective: 'all', channel: 'all', segment: 'all', creator: 'all' }));
    render(<TalkXOverview {...baseProps} />);

    expect(screen.getByText('Nenhum resultado encontrado')).toBeTruthy();
    const limpar = screen.getAllByRole('button', { name: 'Limpar filtros' });
    // O último é o do estado vazio (o primeiro é o da barra, que fica acima).
    fireEvent.click(limpar[limpar.length - 1]);

    expect(screen.getAllByText('Campanha recente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Campanha antiga').length).toBeGreaterThan(0);
  });
});
