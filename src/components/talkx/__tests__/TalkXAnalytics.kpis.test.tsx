import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X185 — barra de filtros do Analytics, 5 KPIs com comparativo e o card
 * "Comparativo de períodos".
 *
 * O que este teste protege:
 *  - cada seletor da barra (período, canal, origem do público, equipe) vira
 *    argumento da RPC `talkx_overview_stats` — não existe mais recorte calculado
 *    no navegador para a taxa de resposta;
 *  - "Limpar filtros" volta ao padrão (sem recorte);
 *  - sem período anterior não há variação; valor nulo mostra "sem dados ainda";
 *  - receita aparece em R$ e o comparativo de períodos mostra a variação (+50%).
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock, from: vi.fn() } }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.in = chain; b.gte = chain; b.eq = chain; b.order = chain; b.limit = chain;
    b.not = () => Promise.resolve({ data: [], error: null });
    return b;
  },
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// A lista de equipes e o papel vêm de fora da tela: aqui entram fixos.
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess: () => true }));
vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [{ id: 'dep-1', name: 'Comercial', description: null, is_active: true }] }),
}));

import { TalkXAnalytics } from '../TalkXAnalytics';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const campaigns = [
  {
    id: 'c1', name: 'Campanha A', status: 'completed', sent_count: 100, delivered_count: 90,
    failed_count: 10, replied_count: 12, total_recipients: 100, outcome_unknown_count: 0,
    started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
] as unknown as TalkXCampaign[];

/** Resumo devolvido pela RPC, no formato de `talkx_overview_stats` (X072). */
function statsPayload(over: Record<string, unknown> = {}) {
  const base = {
    campaigns_sent: 3, completed: 2, contacts_reached: 250, sent: 300, delivered: 280,
    replied: 40, failed: 12, unknown: 1, delivery_rate_pct: 93.3, reply_rate_pct: 13.3,
    read: null, conversions: null, revenue: null, segment_conversion_rate_pct: null,
  };
  return {
    period: { from: '2026-09-10T00:00:00.000Z', to: '2026-10-09T23:59:59.999Z' },
    current: base,
    previous: { ...base, campaigns_sent: 2, sent: 200, delivery_rate_pct: 90, reply_rate_pct: 10 },
    active: 1,
    daily: [{ day: '2026-10-08', sent: 10, delivered: 9, replied: 1 }],
    ...over,
  };
}

/** Argumentos da última chamada da RPC. */
function lastArgs(): Record<string, unknown> {
  const calls = rpcMock.mock.calls;
  const call = calls[calls.length - 1];
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

const dias = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;

describe('TalkXAnalytics — filtros e KPIs da RPC (X185)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: statsPayload(), error: null });
    window.history.replaceState(null, '', '/?tab=analytics');
  });

  it('cada filtro da barra vira argumento da RPC', async () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][0]).toBe('talkx_overview_stats');
    // padrão: 30 dias, sem canal/origem/equipe.
    const base = lastArgs();
    expect(dias(base.p_from as string, base.p_to as string)).toBeGreaterThan(29);
    expect(base.p_channel).toBeUndefined();
    expect(base.p_audience_source).toBeUndefined();
    expect(base.p_department_id).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '7d' } });
    await waitFor(() => expect(dias(lastArgs().p_from as string, lastArgs().p_to as string)).toBeLessThan(8));

    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'whatsapp' } });
    await waitFor(() => expect(lastArgs().p_channel).toBe('whatsapp'));

    fireEvent.change(screen.getByLabelText('Origem do público'), { target: { value: 'crm360' } });
    await waitFor(() => expect(lastArgs().p_audience_source).toBe('crm360'));

    fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'dep-1' } });
    await waitFor(() => expect(lastArgs().p_department_id).toBe('dep-1'));

    // "Personalizado" usa as datas dos campos e não o atalho de 30 dias.
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-01-05' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-01-31' } });
    await waitFor(() => {
      const custom = lastArgs();
      expect(custom.p_from).not.toBe(base.p_from);
      expect(dias(custom.p_from as string, custom.p_to as string)).toBeGreaterThan(25);
      expect(dias(custom.p_from as string, custom.p_to as string)).toBeLessThan(27);
    });
  });

  it('"Limpar filtros" volta ao padrão (sem recorte de canal/origem/equipe)', async () => {
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'whatsapp' } });
    await waitFor(() => expect(lastArgs().p_channel).toBe('whatsapp'));
    const comCanal = rpcMock.mock.calls.filter(([, a]) => (a as Record<string, unknown>).p_channel === 'whatsapp').length;

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect((screen.getByLabelText('Canal') as HTMLSelectElement).value).toBe('all'));
    expect((screen.getByLabelText('Origem do público') as HTMLSelectElement).value).toBe('all');
    expect((screen.getByLabelText('Equipe') as HTMLSelectElement).value).toBe('all');
    expect((screen.getByLabelText('Período') as HTMLSelectElement).value).toBe('30d');
    // Nenhuma consulta nova sai com o canal antigo depois de limpar.
    expect(rpcMock.mock.calls.filter(([, a]) => (a as Record<string, unknown>).p_channel === 'whatsapp').length).toBe(comCanal);
    // E a barra volta a ficar sem filtro ativo (botão desabilitado).
    expect((screen.getByRole('button', { name: 'Limpar filtros' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem período anterior não mostra variação', async () => {
    rpcMock.mockResolvedValue({ data: statsPayload({ previous: null }), error: null });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    // Espera o KPI do resumo renderizar (valor da RPC) antes de olhar a variação.
    await screen.findByText('Taxa de entrega');
    expect(document.querySelectorAll('[data-testid="kpi-comparison"]').length).toBe(0);
    const comparativo = screen.getByTestId('comparativo-periodos');
    expect(within(comparativo).getAllByText('sem comparação')).toHaveLength(3);
    expect(within(comparativo).queryByText('+50%')).toBeNull();
  });

  it('receita nula mostra "sem dados ainda" e receita 284320 mostra R$ 284.320', async () => {
    const { unmount } = wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(screen.getAllByText(/sem dados ainda/i).length).toBeGreaterThan(0));
    unmount();

    rpcMock.mockResolvedValue({
      data: statsPayload({ current: { ...statsPayload().current, revenue: 284320 } }),
      error: null,
    });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => expect(screen.getAllByText('R$ 284.320').length).toBeGreaterThan(0));
  });

  it('erro da RPC não vira "sem dados": a tela diz que falhou e oferece retentar', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => {
      expect(screen.getAllByText('Não foi possível carregar as estatísticas do período').length).toBeGreaterThan(0);
    });
    // O rail também acusa o erro — nada de "sem comparação" fingindo ausência de dado.
    expect(screen.getAllByText('Não foi possível carregar as estatísticas do comparativo').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('kpi-card')).toHaveLength(0);
    expect(screen.queryAllByText('Tentar novamente').length).toBe(2);
  });

  it('o comparativo de períodos mostra a variação (+50%)', async () => {
    rpcMock.mockResolvedValue({
      data: statsPayload({
        current: { ...statsPayload().current, campaigns_sent: 3 },
        previous: { ...statsPayload().current, campaigns_sent: 2 },
      }),
      error: null,
    });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    const comparativo = await screen.findByTestId('comparativo-periodos');
    await waitFor(() => expect(within(comparativo).getByText('+50%')).toBeTruthy());
    // "Envio por segmento"/"Mensagens enviadas" e o "Comparativo de Campanhas" saíram da tela.
    expect(screen.queryByText('Envio por segmento')).toBeNull();
    expect(screen.queryByText('Mensagens enviadas')).toBeNull();
    expect(screen.queryByText('Comparativo de Campanhas')).toBeNull();
  });

  it('os cinco KPIs vêm da RPC: Campanhas enviadas, Taxa de entrega, Taxa de resposta, Conversão por segmento e Receita', async () => {
    rpcMock.mockResolvedValue({
      data: statsPayload({
        current: { ...statsPayload().current, segment_conversion_rate_pct: 8.2, revenue: 284320 },
      }),
      error: null,
    });
    wrap(<TalkXAnalytics campaigns={campaigns} />);
    await waitFor(() => {
      ['Campanhas enviadas', 'Taxa de entrega', 'Taxa de resposta', 'Conversão por segmento', 'Receita influenciada']
        .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    });
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(5);
  });
});
