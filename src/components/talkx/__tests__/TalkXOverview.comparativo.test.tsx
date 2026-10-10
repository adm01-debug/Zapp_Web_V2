import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X077 · N-125 — o comparativo dos KPIs da Visão geral.
 *
 * Aqui o HOOK e o COMPONENTE são os reais; a única coisa falsa é a RPC
 * `talkx_overview_stats` (o `supabase.rpc`). A prova é de ponta:
 * - a barra entrega o período ao hook e os números saem da RPC, sem conta na tela;
 * - com `previous`, o card mostra a variação (com os tokens de cor de sempre);
 * - em "Todo o período" a RPC não tem período anterior e o hook devolve
 *   `previous: null` — mesmo a RPC trazendo `previous`, nenhuma variação aparece.
 */

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { TalkXOverview } from '../TalkXOverview';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

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

const baseProps = {
  campaigns: [campanha({ id: 'c-1', name: 'Campanha 1' })] as TalkXCampaign[],
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

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

/** Payload cru da RPC, no formato que o hook (`parseOverviewStats`) lê. */
function rpcPayload(previous: unknown) {
  return {
    data: {
      current: { campaigns_sent: 5, completed: 8, contacts_reached: 200, sent: 100, delivery_rate_pct: 90 },
      previous,
      active: 0,
      daily: [{ sent: 3 }, { sent: 5 }],
    },
    error: null,
  };
}

const ANTERIOR = { campaigns_sent: 4, completed: 4, contacts_reached: 100, sent: 100, delivery_rate_pct: 80 };

function kpiCard(rotulo: string): HTMLElement {
  const card = screen.getAllByTestId('kpi-card').find((el) => el.textContent?.includes(rotulo));
  if (!card) throw new Error(`card de KPI "${rotulo}" não está na tela`);
  return card;
}

/** A variação do card, lida do DOM real (o `KpiCard` a monta sozinho). */
function comparativo(rotulo: string): HTMLElement | null {
  return kpiCard(rotulo).querySelector('[data-testid="kpi-comparison"]');
}

describe('X077 · comparativo dos KPIs da Visão geral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    // Só o relógio é falso: o recorte de período depende da data.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
  });

  it('com período anterior, os KPIs mostram a variação calculada pelo card', async () => {
    rpc.mockResolvedValue(rpcPayload(ANTERIOR));

    withClient(<TalkXOverview {...baseProps} />);

    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());

    // Concluídas: 8 vs 4 = +100 % (relativo).
    expect(comparativo('Concluídas')!.textContent).toContain('+100%');
    // Contatos alcançados: 200 vs 100 = +100 % (relativo).
    expect(comparativo('Contatos alcançados')!.textContent).toContain('+100%');
    // Taxa de sucesso: 90 vs 80 = +10,0 pontos percentuais.
    expect(comparativo('Taxa de sucesso')!.textContent).toContain('+10,0%');

    // A variação sobe em token de cor de sempre — nada de cor crua no card.
    expect(comparativo('Concluídas')!.className).toContain('text-success');
    // O número da taxa segue com o "%" colado, agora vindo de valor numérico.
    expect(kpiCard('Taxa de sucesso').textContent).toContain('90%');

    // X077 · o rail repete os números da RPC: "Mensagens enviadas" é os contatos
    // alcançados (200), não o `sent` cru (100); a taxa repete os 90%.
    const hero = screen.getByText('Mensagens enviadas').closest('.talkx-card--hero')!;
    expect(hero.textContent).toContain('200');
    expect(hero.textContent).not.toContain('100');
    expect(hero.textContent).toContain('90%');
  });

  it('Base mínima para o comparativo: sem 50 enviados no anterior, a taxa não mostra variação', async () => {
    // A RPC traz previous, mas com só 30 enviados: a taxa recebe previous null
    // (base mínima) enquanto Concluídas e Contatos seguem com variação.
    rpc.mockResolvedValue(rpcPayload({ ...ANTERIOR, sent: 30 }));

    withClient(<TalkXOverview {...baseProps} />);

    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());
    expect(comparativo('Concluídas')!.textContent).toContain('+100%');
    expect(comparativo('Contatos alcançados')!.textContent).toContain('+100%');
    expect(comparativo('Taxa de sucesso')).toBeNull();
    // Sem base o número continua na tela, só a variação some.
    expect(kpiCard('Taxa de sucesso').textContent).toContain('90%');
  });

  it("'7 dias' entrega previous null mesmo com a RPC trazendo previous", async () => {
    // Verificado no código: '7 dias' entrega range ao hook (comparable: true), então a
    // RPC traz previous — mas o previous da TAXA é null pela base mínima (30 < 50
    // enviados). Os demais cards seguem com variação.
    rpc.mockResolvedValue(rpcPayload({ ...ANTERIOR, sent: 30 }));

    withClient(<TalkXOverview {...baseProps} />);
    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '7 dias' }));

    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());
    expect(comparativo('Concluídas')!.textContent).toContain('+100%');
    expect(comparativo('Contatos alcançados')!.textContent).toContain('+100%');
    expect(comparativo('Taxa de sucesso')).toBeNull();
  });

  it('previous sem delivery_rate_pct não mostra variação na taxa', async () => {
    // Campo ausente = null, nunca zero: sem taxa no anterior não há base para
    // pontos percentuais; os demais comparativos seguem normais.
    const { delivery_rate_pct: _fora, ...anteriorSemTaxa } = ANTERIOR;
    rpc.mockResolvedValue(rpcPayload(anteriorSemTaxa));

    withClient(<TalkXOverview {...baseProps} />);

    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());
    expect(comparativo('Concluídas')!.textContent).toContain('+100%');
    expect(comparativo('Contatos alcançados')!.textContent).toContain('+100%');
    expect(comparativo('Taxa de sucesso')).toBeNull();
    expect(kpiCard('Taxa de sucesso').textContent).toContain('90%');
  });

  it('"Todo o período" não tem comparativo: a variação some mesmo com a RPC trazendo previous', async () => {
    rpc.mockResolvedValue(rpcPayload(ANTERIOR));

    withClient(<TalkXOverview {...baseProps} />);
    await waitFor(() => expect(comparativo('Concluídas')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Todo o período' }));

    await waitFor(() => expect(comparativo('Concluídas')).toBeNull());
    expect(comparativo('Taxa de sucesso')).toBeNull();
    expect(comparativo('Contatos alcançados')).toBeNull();
  });
});
