/**
 * X048 (TL-106) — a Visão geral aplica o estado "WhatsApp desconectado".
 *
 * Antes: sem conexão ativa, a Visão geral mostrava a tabela de campanhas como se
 * nada faltasse (`TalkXWhatsAppDisconnectedState` tinha 0 usos fora do wizard).
 * Agora a faixa de estado aparece acima da tabela e o botão "Conectar WhatsApp"
 * leva para a tela Conexões.
 *
 * A prova renderiza o componente REAL e o hook REAL (`useTalkXServiceStatus`):
 * só o cliente do Supabase é mockado, devolvendo a resposta de
 * `whatsapp_connections` — o mesmo caminho que a tela usa.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };

/** Builder encadeável mínimo do PostgREST (mesmo padrão de useCatalogSendReadiness.test.ts). */
function mockQuery(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  ['select', 'eq', 'limit', 'maybeSingle'].forEach((method) => { builder[method] = vi.fn(self); });
  builder.then = (onFulfilled: (value: QueryResult) => unknown) => Promise.resolve(result).then(onFulfilled);
  return builder;
}

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [], isLoading: false, isError: false, error: null, isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() }, duplicateCampaign: { mutateAsync: vi.fn() },
    refetchCampaigns: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/components/talkx/TalkXHelp', () => ({ TalkXHelp: () => <div /> }));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

const TITULO = 'Conexão WhatsApp desconectada';
const BOTAO = 'Conectar WhatsApp';
const SEM_CONEXAO: QueryResult = { data: [], error: null };
const COM_CONEXAO: QueryResult = { data: [{ id: 'conn-1' }], error: null };

describe('TalkXView · Visão geral aplica o estado WhatsApp desconectado (X048)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => mockQuery(SEM_CONEXAO));
    window.history.replaceState(null, '', '/?view=talkx');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/?view=talkx');
  });

  it('sem conexão ativa, mostra a faixa e o botão ligado acima da tabela', async () => {
    render(<TalkXView />);

    expect(await screen.findByText(TITULO)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BOTAO })).toBeInTheDocument();
    // Consultou a tabela certa, pelo status certo.
    expect(mockFrom).toHaveBeenCalledWith('whatsapp_connections');
  });

  it('"Conectar WhatsApp" navega para a tela Conexões', async () => {
    render(<TalkXView />);
    const button = await screen.findByRole('button', { name: BOTAO });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(new URLSearchParams(window.location.search).get('view')).toBe('connections');
  });

  it('com conexão conectada, a faixa não aparece', async () => {
    mockFrom.mockImplementation(() => mockQuery(COM_CONEXAO));
    render(<TalkXView />);

    await screen.findByTestId('overview');
    expect(screen.queryByText(TITULO)).toBeNull();
  });

  it('consulta que falha não vira falso "desconectado"', async () => {
    mockFrom.mockImplementation(() => mockQuery({ data: null, error: { message: 'rede fora' } }));
    render(<TalkXView />);

    await screen.findByTestId('overview');
    expect(screen.queryByText(TITULO)).toBeNull();
  });
});
