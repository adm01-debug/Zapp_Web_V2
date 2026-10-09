import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * TL-135b (X114 · tela 02) — KPIs da biblioteca de segmentos.
 *
 * A tela não calcula mais os KPIs no navegador: ela lê
 * `talkx_segment_library_stats` (X103) pelo hook. Aqui entra o TalkXSegments REAL
 * (com o hook real) e só a FRONTEIRA DE REDE é mockada — a RPC e a leitura de
 * segmentos —, para provar que os números da RPC chegam à tela: os quatro títulos
 * do plano, as mini-barras de 8 meses de "Ativos este mês" e a variação contra o
 * mês anterior; e que a conversão sem base mínima cai no "Sem dados ainda" do kit
 * em vez de inventar número.
 *
 * Fixture com os números do mock da tela 02 (T02-010/T02-012/T02-014/T02-016):
 * 48 segmentos, 36 ativos no mês (30 no mês anterior = +20%), 12 de CRM 360°
 * (9 no mês anterior = +33%), conversão média 7,8% (+2,1 p.p.).
 */

const MESES = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
const SERIE_TOTAL = [30, 32, 34, 36, 38, 41, 45, 48];
const SERIE_ATIVOS = [12, 15, 18, 21, 24, 28, 30, 36];
const SERIE_CRM360 = [3, 4, 5, 6, 7, 8, 9, 12];

function statsComBaseMinima(): TalkXSegmentLibraryStats {
  return {
    generated_at: '2026-10-09T08:00:00Z',
    timezone: 'America/Sao_Paulo',
    month_start: '2026-10-01',
    total_segments: 48,
    active_this_month: 36,
    active_previous_month: 30,
    active_delta: 6,
    crm360_connected: 12,
    crm360_previous_month: 9,
    crm360_delta: 3,
    conversion: {
      value_pct: 7.8,
      previous_pct: 5.7,
      delta_pp: 2.1,
      has_data: true,
      deliveries: 170,
      conversions: 17,
      previous_deliveries: 130,
      previous_conversions: 7,
      min_deliveries: 100,
    },
    series: MESES.map((month, i) => ({
      month,
      has_data: true,
      total_segments: SERIE_TOTAL[i],
      active_segments: SERIE_ATIVOS[i],
      crm360_segments: SERIE_CRM360[i],
      deliveries: 100 + i,
      conversions: 10 + i,
      conversion_pct: 10,
    })),
  };
}

function statsSemBaseMinima() {
  const stats = statsComBaseMinima();
  // Entregues abaixo da base mínima (100): a RPC devolve has_data falso e NENHUM
  // percentual — a tela não pode mostrar 0% nem repetir o número do mês passado.
  stats.conversion = {
    value_pct: null,
    previous_pct: null,
    delta_pp: null,
    has_data: false,
    deliveries: 40,
    conversions: 3,
    previous_deliveries: 20,
    previous_conversions: 1,
    min_deliveries: 100,
  };
  return stats;
}

// A resposta da RPC é lida na hora da chamada (não na importação): o teste troca o
// conteúdo entre os casos sem recarregar o módulo.
let respostaStats: unknown = statsComBaseMinima();
const chamadasRpc: { name: string; args: unknown }[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => {
      chamadasRpc.push({ name, args });
      if (name === 'talkx_segment_library_stats') return Promise.resolve({ data: respostaStats, error: null });
      // Outras RPCs (audiência) não são o alvo deste teste.
      return Promise.resolve({ data: { eligible: 0, rows: [], has_more: false, next_after: null }, error: null });
    },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Movimento reduzido: o CountUp do cartão de KPI mostra o número final de imediato
// (o jsdom não roda a animação). O valor provado continua sendo o da RPC.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

import { TalkXSegments } from '../TalkXSegments';
import type { TalkXSegmentLibraryStats } from '@/hooks/integrations/useTalkXSegments';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** O cartão que traz o rótulo, para ler valor, variação e barras DELE. */
function cartao(rotulo: string): HTMLElement {
  const el = screen.getByText(rotulo).closest('[data-testid="kpi-card"]');
  if (!el) throw new Error(`cartão de KPI não encontrado: ${rotulo}`);
  return el as HTMLElement;
}

beforeEach(() => {
  respostaStats = statsComBaseMinima();
  chamadasRpc.length = 0;
});

describe('TalkXSegments · KPIs da biblioteca lidos de talkx_segment_library_stats (TL-135b)', () => {
  it('mostra os quatro KPIs do plano com os números da RPC, e não mais "Contatos cobertos"', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Total de segmentos')).toBeTruthy());
    expect(screen.getByText('Ativos este mês')).toBeTruthy();
    expect(screen.getByText('CRM 360° conectados')).toBeTruthy();
    expect(screen.getByText('Conversão média')).toBeTruthy();

    // Critério 2: o KPI antigo (soma de estimated_count, que contava o mesmo
    // contato várias vezes) sai da biblioteca.
    expect(screen.queryByText('Contatos cobertos')).toBeNull();

    expect(cartao('Total de segmentos').textContent).toContain('48');
    expect(cartao('Ativos este mês').textContent).toContain('36');
    expect(cartao('CRM 360° conectados').textContent).toContain('12');
    expect(cartao('Conversão média').textContent).toContain('7,8%');

    // Critério 1: os KPIs vêm da RPC do servidor (no fuso do produto), não de
    // arrays locais de segmentos.
    expect(chamadasRpc).toContainEqual({
      name: 'talkx_segment_library_stats',
      args: { p_timezone: 'America/Sao_Paulo' },
    });
  });

  it('"Ativos este mês": mini-barras dos 8 meses da série e variação contra o mês anterior', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ativos este mês')).toBeTruthy());

    const barras = cartao('Ativos este mês').querySelectorAll('[data-testid="kpi-bars"] > *');
    expect(barras).toHaveLength(8);
    // Cada barra é o mês da série, na ordem: o último mês (36) é o topo do gráfico
    // e o primeiro (12) tem um terço dele.
    const alturas = Array.from(barras).map((b) => (b as HTMLElement).style.height);
    expect(alturas[7]).toBe('100%');
    expect(alturas[0]).toBe('33%');

    const variacao = cartao('Ativos este mês').textContent ?? '';
    expect(variacao).toContain('+20%');
    expect(variacao).toContain('vs. mês anterior');
  });

  it('"CRM 360° conectados" mostra a variação contra o mês anterior', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('CRM 360° conectados')).toBeTruthy());

    const conteudo = cartao('CRM 360° conectados').textContent ?? '';
    expect(conteudo).toContain('12');
    expect(conteudo).toContain('+33%');
    expect(conteudo).toContain('vs. mês anterior');
  });

  it('"Conversão média" mostra o percentual e a variação em p.p.', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Conversão média')).toBeTruthy());

    const conteudo = cartao('Conversão média').textContent ?? '';
    expect(conteudo).toContain('7,8%');
    expect(conteudo).toContain('+2,1 p.p.');
    expect(conteudo).toContain('vs. mês anterior');
  });

  it('conversão abaixo da base mínima: estado "Sem dados ainda" do kit, sem número inventado', async () => {
    respostaStats = statsSemBaseMinima();
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Total de segmentos')).toBeTruthy());

    expect(screen.getByText('Sem dados ainda')).toBeTruthy();
    expect(screen.queryByText('Conversão média')).toBeNull();
    // Nenhum percentual de conversão na tela: o único "0%" possível seria inventado.
    expect(screen.queryByText('0,0%')).toBeNull();
    // Os outros três KPIs continuam com os números da RPC.
    expect(cartao('Total de segmentos').textContent).toContain('48');
    expect(cartao('Ativos este mês').textContent).toContain('36');
    expect(cartao('CRM 360° conectados').textContent).toContain('12');
  });
});
