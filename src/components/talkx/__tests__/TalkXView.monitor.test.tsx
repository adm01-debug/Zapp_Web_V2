import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, startOfDay, subDays } from 'date-fns';

/**
 * X145 (TL-154) — a tela "Monitor" do módulo Talk X no fluxo atual de rota
 * (?campaign=<id>&screen=monitor, tela cheia sem abas).
 *
 * Renderiza o TalkXView de verdade e o TalkXLiveMonitor de verdade (só o cliente
 * do banco é falso, e ele GRAVA o que foi pedido): o que se prova aqui é que a
 * rota de tela abre a campanha roteada, que cada filtro do cabeçalho chega na
 * leitura certa e que a leitura de campanhas com erro mostra o erro do kit.
 */

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  segmentos: [] as Array<{ id: string; name: string }>,
  queries: [] as Array<{ table: string; id: string | null; filters: Array<[string, unknown]>; or: string | null }>,
  rateArgs: [] as unknown[][],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetchCalls: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  type Rec = { table: string; id: string | null; filters: Array<[string, unknown]>; or: string | null };
  const makeChain = (table: string) => {
    const rec: Rec = { table, id: null, filters: [], or: null };
    h.queries.push(rec);
    const resolve = () => Promise.resolve({
      data: table === 'talkx_campaigns' ? h.campaigns.find((c) => c.id === rec.id) ?? null : [],
      error: null,
    });
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (col: string, value: unknown) => {
      rec.filters.push([col, value]);
      if (col === 'id') rec.id = String(value);
      return builder;
    };
    builder.or = (expr: string) => { rec.or = expr; return builder; };
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.single = () => resolve();
    // O construtor é "thenable": o código encadeia `.eq` depois do `.limit` e só então aguarda.
    builder.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => resolve().then(ok, fail);
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: h.isLoading,
    isError: h.isError,
    error: h.error,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
    refetchCampaigns: () => { h.refetchCalls += 1; },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: h.segmentos }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/integrations/useTalkXServiceStatus', () => ({
  useTalkXServiceStatus: () => ({ whatsapp: { connected: true } }),
}));
vi.mock('@/hooks/integrations/useTalkXLiveChannel', () => ({
  useTalkXLiveChannel: () => ({
    status: 'live', live: true, degraded: false, offline: false, panelPollMs: null, tablePollMs: null,
  }),
}));
vi.mock('@/hooks/integrations/useTalkXServerResumePrecheck', () => ({
  useTalkXServerResumePrecheck: () => ({ precheck: null, isLoading: false }),
}));
vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));
vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: (...args: unknown[]) => {
    h.rateArgs.push(args);
    return { rateByMinute: [], recipients: [], isLoading: false, isError: false, refetch: vi.fn() };
  },
}));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({
  TalkXCampaignWizard: ({ campaign }: { campaign: { id?: string } | null }) => (
    <section data-testid="wizard" data-campaign-id={campaign?.id ?? 'new'} />
  ),
}));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div data-testid="suppression" /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignPaused', () => ({ TalkXCampaignPaused: () => <div /> }));
vi.mock('@/components/talkx/report/TalkXCampaignReport', () => ({ TalkXCampaignReport: () => <div /> }));
vi.mock('@/components/talkx/help/TalkXHelpCenter', () => ({ TalkXHelpCenter: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const baseCampaign = {
  name: 'Campanha de base', message_template: 'Olá', status: 'sending',
  total_recipients: 10, sent_count: 3, delivered_count: 2, failed_count: 1,
  outcome_unknown_count: 0, started_at: subDays(new Date(), 1).toISOString(), completed_at: null,
  whatsapp_connection_id: null, created_at: subDays(new Date(), 2).toISOString(),
};

const sending = { ...baseCampaign, id: 'c-sending', name: 'Campanha em andamento', status: 'sending', segment_id: 'seg-vip', started_at: subDays(new Date(), 2).toISOString() };
const paused = { ...baseCampaign, id: 'c-paused', name: 'Campanha pausada', status: 'paused', started_at: subDays(new Date(), 5).toISOString() };
const completed = { ...baseCampaign, id: 'c-done', name: 'Campanha concluída', status: 'completed' };

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><TalkXView /></QueryClientProvider>);
}

const campanhaLida = () => h.queries.filter((q) => q.table === 'talkx_campaigns').map((q) => q.id);
const recorteDeDestinatarios = () => h.queries.filter((q) => q.table === 'talkx_recipients');
const janelaDeHoje = () => {
  const recortes = recorteDeDestinatarios();
  return recortes.length > 0 ? recortes[recortes.length - 1].or ?? '' : '';
};
const temFiltro = (coluna: string, valor: unknown) => recorteDeDestinatarios()
  .some((q) => q.filters.some(([c, v]) => c === coluna && v === valor));

function abrirSelect(nome: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: nome }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
}

beforeAll(() => { h.segmentos = [{ id: 'seg-vip', name: 'Clientes VIP' }]; });

afterEach(() => {
  vi.clearAllMocks();
  h.queries = [];
  h.rateArgs = [];
  h.isLoading = false;
  h.isError = false;
  h.error = null;
  h.refetchCalls = 0;
});

describe('TalkXView — tela Monitor (X145)', () => {
  it('(1) ?campaign=&screen=monitor abre a campanha roteada no Monitor', async () => {
    window.history.replaceState(null, '', '/?campaign=c-sending&screen=monitor');
    h.campaigns = [completed, paused, sending];
    renderView();

    expect(await screen.findByRole('heading', { name: 'Monitor ao Vivo' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Campanha em acompanhamento' }).textContent)
      .toContain('Em andamento · Campanha em andamento · Iniciada às');

    await waitFor(() => expect(campanhaLida()).toContain('c-sending'));
  });

  it('(2) sem campanha em envio, a rota da pausada acompanha a pausada', async () => {
    window.history.replaceState(null, '', '/?campaign=c-paused&screen=monitor');
    h.campaigns = [completed, paused];
    renderView();

    expect(await screen.findByRole('heading', { name: 'Monitor ao Vivo' })).toBeTruthy();
    await waitFor(() => expect(campanhaLida()).toContain('c-paused'));
  });

  it('(3) campanha inexistente na rota mostra o estado vazio do kit com "Nova campanha"', async () => {
    window.history.replaceState(null, '', '/?campaign=c-ghost&screen=monitor');
    h.campaigns = [completed];
    renderView();

    expect(await screen.findByText('Nenhuma campanha em andamento')).toBeTruthy();
    expect(screen.queryByText('Monitor ao Vivo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nova campanha' }));
    await waitFor(() => expect(screen.getByTestId('wizard').getAttribute('data-campaign-id')).toBe('new'));
  });

  it('(4) o filtro de status do cabeçalho recorta a lista de destinatários e não o ritmo', async () => {
    window.history.replaceState(null, '', '/?campaign=c-sending&screen=monitor');
    h.campaigns = [sending];
    renderView();

    await screen.findByRole('heading', { name: 'Monitor ao Vivo' });
    await waitFor(() => expect(recorteDeDestinatarios().length).toBeGreaterThan(0));
    expect(temFiltro('status', 'delivered')).toBe(false);

    abrirSelect('Status');
    fireEvent.click(screen.getByRole('option', { name: 'Entregue' }));

    await waitFor(() => expect(temFiltro('status', 'delivered')).toBe(true));
    // o gráfico/KPIs não são recortados pelo status: a leitura do ritmo nunca leva o filtro
    expect(h.rateArgs.length).toBeGreaterThan(0);
    expect(h.rateArgs.every((args) => args.length === 1 || args[1] === 'all')).toBe(true);
  });

  it('(5) o filtro de segmentação recorta a leitura pelo segmento da campanha', async () => {
    window.history.replaceState(null, '', '/?campaign=c-sending&screen=monitor');
    h.campaigns = [sending];
    renderView();

    await screen.findByRole('heading', { name: 'Monitor ao Vivo' });
    abrirSelect('Segmentação');
    fireEvent.click(screen.getByRole('option', { name: 'Clientes VIP' }));

    await waitFor(() => expect(temFiltro('segment_id', 'seg-vip')).toBe(true));
  });

  it('(6) o filtro de dia recorta a janela do dia escolhido (sem esconder quem está na fila)', async () => {
    window.history.replaceState(null, '', '/?campaign=c-sending&screen=monitor');
    h.campaigns = [sending];
    renderView();

    await screen.findByRole('heading', { name: 'Monitor ao Vivo' });
    await waitFor(() => expect(janelaDeHoje()).toContain('sent_at.is.null'));
    const janelaInicial = janelaDeHoje();

    abrirSelect('Dia');
    const outroDia = screen.getAllByRole('option').filter((item) => !(item.textContent ?? '').startsWith('Hoje'));
    fireEvent.click(outroDia[0]);

    const janelaDeOntem = startOfDay(subDays(new Date(), 1)).toISOString();
    await waitFor(() => expect(janelaDeHoje()).not.toBe(janelaInicial));
    expect(janelaDeHoje()).toContain(janelaDeOntem);
    expect(janelaDeHoje()).toContain(`${format(subDays(new Date(), 1), 'yyyy-MM-dd')}`);
  });

  it('(7) leitura de campanhas com erro mostra o erro do kit, nunca o vazio, e "Tentar novamente" refaz a leitura', async () => {
    window.history.replaceState(null, '', '/?campaign=c-sending&screen=monitor');
    h.campaigns = [];
    h.isError = true;
    h.error = new Error('falha de rede');
    renderView();

    expect(await screen.findByText('Não foi possível carregar as campanhas')).toBeTruthy();
    expect(screen.queryByText('Nenhuma campanha em andamento')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(h.refetchCalls).toBe(1));
  });
});
