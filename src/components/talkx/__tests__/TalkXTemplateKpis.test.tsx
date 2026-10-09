import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, renderHook, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X091 — KPIs das telas 04 e 05 ligados às RPCs de métricas.
 *
 * O que este teste prova:
 * 1. a faixa da tela 04 sai da RPC `talkx_template_library_stats` (não da contagem
 *    no navegador) e a taxa de resposta aparece como "28,6%" com a variação em p.p.;
 * 2. sem taxa devolvida, o card do kit mostra "Sem dados ainda";
 * 3. o card "Desempenho deste template" lê `talkx_template_stats`, mostra "1.250" de
 *    ENVIOS (nunca o `use_count`, que conta campanhas) e a variação "↑ 4,3 p.p.";
 * 4. trocar de template pela biblioteca troca os números e a chamada passa a levar
 *    o novo `p_template_id`;
 * 5. mudar o período muda os argumentos da chamada (30 → 90 dias).
 *
 * A RPC é simulada; o hook é o REAL e quem o exercita é o componente real.
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  campaigns: [] as Array<Record<string, unknown>>,
  templates: [
    {
      id: 't1', name: 'Boas-vindas', description: 'Saudação', category: 'geral',
      content: 'Olá {{nome}}!', media_url: null, media_type: null, tags: ['boas-vindas'],
      status: 'approved' as const, use_count: 999, created_by: null, custom_variables: [],
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-02T10:00:00.000Z',
    },
    {
      id: 't2', name: 'Oferta VIP', description: 'Promoção', category: 'vendas',
      content: 'Oferta do dia', media_url: null, media_type: null, tags: [],
      status: 'draft' as const, use_count: 3, created_by: null, custom_variables: [],
      created_at: '2026-09-03T10:00:00.000Z', updated_at: '2026-09-04T10:00:00.000Z',
    },
  ],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: h.campaigns, isLoading: false, isError: false, error: null, isLive: false, refetchCampaigns: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: h.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplates } from '../TalkXTemplates';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { useTalkXTemplateStats, useTalkXTemplateLibraryStats, pointsDelta, templateStatsRange } from '@/hooks/integrations/useTalkXTemplateStats';

const libraryStats = {
  total: 48,
  created_current_month: 12,
  created_previous_month: 10,
  created_series: [1, 2, 3, 4, 5, 6, 7, 8],
  approved: 36,
  approved_period: 42,
  approved_previous_period: 37,
  approved_series: [1, 1, 2, 3, 4, 5, 6, 6],
  most_used: { name: 'Boas-vindas CRM', messages: 2341, series: [1, 2, 3, 4] },
  with_media: 18,
  with_media_series: [0, 1, 1, 2, 2, 3, 3, 4],
  avg_reply_rate_pct: 28.6,
  avg_reply_rate_previous_pct: 24.3,
  reply_base_current: 320,
  reply_base_previous: 290,
  best_reply: { name: 'Boas-vindas', version: 2, reply_rate_pct: 28.4 },
};

/** Desempenho: t1 com base cheia (variação válida); t2 com base pequena (sem variação). */
const templateStats: Record<string, unknown> = {
  t1: {
    sent: 1250, replied: 357, converted: 40, opted_out: 10,
    reply_rate_pct: 28.6, conversion_rate_pct: 3.2, rejection_rate_pct: 0.8,
    previous: {
      sent: 1000, replied: 243, converted: 30, opted_out: 9,
      reply_rate_pct: 24.3, conversion_rate_pct: 3.0, rejection_rate_pct: 0.9,
    },
  },
  t2: {
    sent: 300, replied: 36, converted: 3, opted_out: 1,
    reply_rate_pct: 12.5, conversion_rate_pct: 1.0, rejection_rate_pct: 0.3,
    previous: {
      sent: 12, replied: 2, converted: 0, opted_out: 0,
      reply_rate_pct: 16.6, conversion_rate_pct: 0, rejection_rate_pct: 0,
    },
  },
};

const vazio = {
  sent: 0, replied: 0, converted: 0, opted_out: 0,
  reply_rate_pct: null, conversion_rate_pct: null, rejection_rate_pct: null,
  previous: null,
};

function rpcPadrao() {
  h.rpc.mockImplementation((nome: string, args: { p_template_id?: string }) => {
    if (nome === 'talkx_template_library_stats') return Promise.resolve({ data: libraryStats, error: null });
    if (nome === 'talkx_template_stats') return Promise.resolve({ data: templateStats[args.p_template_id ?? ''] ?? vazio, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function secaoDesempenho() {
  const titulo = screen.getByText('Desempenho deste template');
  return within(titulo.closest('section') as HTMLElement);
}

describe('X091 — KPIs das telas 04 e 05 nas RPCs', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    rpcPadrao();
  });

  it('tela 04: a faixa sai da RPC da biblioteca, com a taxa de resposta e a variação em p.p.', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />, { wrapper });

    // "Total de templates" = 48 da RPC (no navegador seriam 2 templates na lista).
    expect(await screen.findByText('48')).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith('talkx_template_library_stats', { p_days: 30, p_top: 3 });
    // "Mais usados" mostra o NOME como valor.
    expect(screen.getByText('Boas-vindas CRM')).toBeTruthy();
    // Taxa média de resposta: valor em % + variação de +4,3 (28,6 − 24,3).
    expect(screen.getByText('28,6%')).toBeTruthy();
    expect(screen.getByText('+4,3%')).toBeTruthy();
  });

  it('tela 04: taxa nula vira "Sem dados ainda" no card', async () => {
    h.rpc.mockImplementation((nome: string) =>
      nome === 'talkx_template_library_stats'
        ? Promise.resolve({ data: { ...libraryStats, avg_reply_rate_pct: null, avg_reply_rate_previous_pct: null }, error: null })
        : Promise.resolve({ data: null, error: null }));

    render(<TalkXTemplates onUseTemplate={vi.fn()} />, { wrapper });

    const card = await screen.findByTitle('Respostas ÷ enviados no período; a variação é em pontos percentuais');
    expect(card.textContent).toMatch(/sem dados ainda/i);
    expect(screen.queryByText('28,6%')).toBeNull();
  });

  it('tela 05: "Desempenho deste template" lê envios da RPC (nunca o use_count) com variação em p.p.', async () => {
    render(<TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[0]} onClose={vi.fn()} />, { wrapper });

    await waitFor(() => expect(secaoDesempenho().getByText('1.250')).toBeTruthy());
    expect(secaoDesempenho().getByText('28,6%')).toBeTruthy();
    expect(secaoDesempenho().getByText('↑ 4,3 p.p.')).toBeTruthy();
    // `use_count` é 999 e NÃO pode aparecer como "Envios" (conta campanhas, não mensagens).
    expect(secaoDesempenho().queryByText('999')).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith('talkx_template_stats', expect.objectContaining({ p_template_id: 't1' }));
  });

  it('tela 05: "Total de Templates" mostra o total acumulado, mas compara criados do mês (12 vs 10 = +20%, não +380%)', async () => {
    render(<TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[0]} onClose={vi.fn()} />, { wrapper });

    // O valor continua sendo o total acumulado devolvido pela RPC da biblioteca (48).
    const label = await screen.findByText('Total de Templates');
    const card = label.closest('[data-testid="kpi-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    await waitFor(() => expect(within(card).getByText('48')).toBeTruthy());

    // A variação compara grandezas iguais: criados no mês atual (12) vs. mês anterior (10) = +20%.
    expect(within(card).getByTestId('kpi-comparison').textContent).toContain('+20%');
    // Nunca o total (48) contra os criados do mês anterior (10), que daria +380%.
    expect(within(card).queryByText(/380/)).toBeNull();
  });

  it('tela 05: trocar de template na biblioteca troca os números do card', async () => {
    render(<TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[0]} onClose={vi.fn()} />, { wrapper });
    await waitFor(() => expect(secaoDesempenho().getByText('1.250')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Oferta VIP/ }));

    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('talkx_template_stats', expect.objectContaining({ p_template_id: 't2' })));
    await waitFor(() => expect(secaoDesempenho().getByText('300')).toBeTruthy());
    expect(secaoDesempenho().getByText('12,5%')).toBeTruthy();
    expect(secaoDesempenho().queryByText('1.250')).toBeNull();
    // Base pequena (12 enviados antes) não gera variação: nenhuma seta em p.p.
    expect(secaoDesempenho().queryByText(/p\.p\./)).toBeNull();
  });

  it('tela 05: template sem número nenhum mostra "Sem dados ainda" sem seta', async () => {
    render(<TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[1]} onClose={vi.fn()} />, { wrapper });

    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('talkx_template_stats', expect.objectContaining({ p_template_id: 't2' })));
    h.rpc.mockImplementation((nome: string) =>
      nome === 'talkx_template_stats' ? Promise.resolve({ data: vazio, error: null }) : Promise.resolve({ data: libraryStats, error: null }));
    fireEvent.click(screen.getByRole('button', { name: /Boas-vindas/ }));

    await waitFor(() => expect(secaoDesempenho().getAllByText('Sem dados ainda').length).toBeGreaterThan(0));
    expect(secaoDesempenho().queryByText(/p\.p\./)).toBeNull();
  });

  it('tela 05: widget "Em andamento" mostra a campanha em envio (com a hora) e leva ao monitor; sem envio, não aparece', async () => {
    h.campaigns.push(
      { id: 'c1', name: 'Black Friday', status: 'sending', started_at: '2026-10-09T17:28:00.000Z', created_at: '2026-10-09T17:00:00.000Z' },
      { id: 'c0', name: 'Antiga', status: 'completed', started_at: '2026-10-01T10:00:00.000Z', created_at: '2026-10-01T10:00:00.000Z' },
    );
    const onOpenMonitor = vi.fn();
    const { unmount } = render(
      <TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[0]} onClose={vi.fn()} onOpenMonitor={onOpenMonitor} />,
      { wrapper },
    );

    const widget = await screen.findByRole('button', { name: /Em andamento/ });
    expect(widget.textContent).toMatch(/Iniciada às \d{2}:\d{2}/);
    fireEvent.click(widget);
    expect(onOpenMonitor).toHaveBeenCalledWith('c1');
    unmount();

    // Sem campanha em `sending`, o widget não existe.
    h.campaigns.length = 0;
    h.campaigns.push({ id: 'c0', name: 'Antiga', status: 'completed', started_at: '2026-10-01T10:00:00.000Z', created_at: '2026-10-01T10:00:00.000Z' });
    render(<TalkXTemplateEditor templates={h.templates} isLoading={false} editing={h.templates[0]} onClose={vi.fn()} onOpenMonitor={onOpenMonitor} />, { wrapper });
    expect(screen.queryByRole('button', { name: /Em andamento/ })).toBeNull();
  });

  it('mudar o período muda os argumentos da RPC (30 → 90 dias)', async () => {
    const { rerender } = renderHook(({ dias }: { dias: number }) => useTalkXTemplateStats('t1', dias), {
      wrapper,
      initialProps: { dias: 30 },
    });
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));

    rerender({ dias: 90 });
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));

    const [arg30, arg90] = h.rpc.mock.calls.map((chamada) => chamada[1] as { p_from: string; p_to: string });
    const janela = (a: { p_from: string; p_to: string }) => Math.round((new Date(a.p_to).getTime() - new Date(a.p_from).getTime()) / 86_400_000);
    expect(janela(arg30)).toBe(30);
    expect(janela(arg90)).toBe(90);
  });

  it('sem base mínima de enviados não existe variação (A9) e a RPC com erro não vira número', async () => {
    // 49 enviados no período: abaixo do mínimo de A9.
    expect(pointsDelta(28.6, 24.3, 49, 900)).toBeNull();
    expect(pointsDelta(28.6, 24.3, 900, 49)).toBeNull();
    expect(pointsDelta(28.6, 24.3, 900, 900)).toBeCloseTo(4.3, 5);

    // Erro da RPC é propagado pelo hook (não é "zero linhas = sucesso").
    h.rpc.mockResolvedValue({ data: null, error: new Error('permission denied for function talkx_template_stats') });
    const { result } = renderHook(() => useTalkXTemplateStats('t1', 30), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.stats).toBeNull();
  });

  it('a biblioteca usa os mesmos argumentos (dias/top) e o período é calculado em dias', async () => {
    const { result } = renderHook(() => useTalkXTemplateLibraryStats(30, 3), { wrapper });
    await waitFor(() => expect(result.current.stats?.total).toBe(48));
    expect(h.rpc).toHaveBeenCalledWith('talkx_template_library_stats', { p_days: 30, p_top: 3 });

    const agora = new Date('2026-10-09T12:00:00.000Z');
    expect(templateStatsRange(30, agora).p_from).toBe('2026-09-09T12:00:00.000Z');
    expect(templateStatsRange(90, agora).p_from).toBe('2026-07-11T12:00:00.000Z');
  });
});
