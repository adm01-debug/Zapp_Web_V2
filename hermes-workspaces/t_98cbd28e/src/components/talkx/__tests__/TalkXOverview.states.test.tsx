import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X047 — estados da Visão geral e carregamento de campanha do wizard.
 *
 * Regra da etapa: consulta que falhou mostra o ERRO (com retry), nunca o vazio;
 * enquanto a campanha roteada resolve, o wizard mostra esqueleto com aria-busy
 * em vez do texto solto que existia antes.
 *
 * Casos protegidos:
 * 1. `isError` com lista vazia → erro visível e NADA de vazio (o defeito que
 *    esta etapa corrige: a falha parecia "nenhuma campanha encontrada").
 * 2. "Tentar novamente" refaz a consulta sem resetar filtros nem rota.
 * 3. Carregando → esqueleto marcado com aria-busy.
 * 4. Sem erro e vazio → aí sim o vazio.
 * 5. `TalkXView` encaminha o erro/refetch da consulta de campanhas à Visão geral.
 * 6. Wizard resolvendo campanha roteada → esqueleto com aria-busy, sem o
 *    placeholder de carregamento legado (texto solto).
 */

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetchCampaigns: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isError: f.isError,
    error: f.error,
    isFetching: false,
    isLive: false,
    refetchCampaigns: f.refetchCampaigns,
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({
  TalkXCampaignWizard: ({ campaign }: { campaign?: { id?: string } | null }) => (
    <section data-testid="wizard" data-campaign-id={campaign?.id ?? 'new'} />
  ),
}));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import { TalkXOverview } from '../TalkXOverview';
import TalkXView from '../TalkXView';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campaign = {
  id: 'c1', name: 'Campanha teste', status: 'sending', message_template: 'Oi {{nome}}',
  description: '', objective: 'engajamento', segment_id: null, audience_source: 'manual',
  created_by: 'u1', sent_count: 10, failed_count: 1, total_recipients: 20,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
  started_at: null, completed_at: null, scheduled_at: null, draft_step: null,
} as unknown as TalkXCampaign;

const baseProps = {
  campaigns: [] as TalkXCampaign[],
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

describe('Visão geral — estados da consulta (X047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.campaigns = [];
    f.isLoading = false;
    f.isError = false;
    f.error = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('erro: mostra o erro e NUNCA o vazio', () => {
    const { container } = render(
      <TalkXOverview {...baseProps} campaigns={[]} isError error={new Error('falha de rede')} onRetry={vi.fn()} />,
    );
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(screen.queryByText('Nenhuma campanha encontrada')).toBeNull();
  });

  it('Tentar novamente refaz a consulta sem mexer na rota nem nos filtros', () => {
    sessionStorage.setItem(
      'talkx.overview.filters',
      JSON.stringify({ status: 'sending', objective: 'all', segment: 'all', creator: 'all' }),
    );
    const push = vi.spyOn(window.history, 'pushState');
    const onRetry = vi.fn();
    const { rerender } = render(
      <TalkXOverview {...baseProps} campaigns={[]} isError error={new Error('falha de rede')} onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?view=talkx&tab=overview');

    // Quando a consulta volta a responder, os filtros que o usuário tinha seguem aplicados.
    rerender(<TalkXOverview {...baseProps} campaigns={[campaign]} isError={false} onRetry={onRetry} />);
    expect(JSON.parse(sessionStorage.getItem('talkx.overview.filters') ?? '{}')).toMatchObject({ status: 'sending' });
    push.mockRestore();
  });

  it('carregando: mostra o esqueleto com aria-busy, não o erro', () => {
    const { container } = render(<TalkXOverview {...baseProps} campaigns={[]} isLoading isError={false} />);
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
  });

  it('vazio sem erro: aí sim mostra o vazio', () => {
    const { container } = render(<TalkXOverview {...baseProps} campaigns={[]} isError={false} />);
    expect(screen.getByText('Nenhuma campanha encontrada')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
  });
});

describe('TalkXView — erro da consulta chega à Visão geral (X047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.campaigns = [];
    f.isLoading = false;
    f.isError = false;
    f.error = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx');
  });

  it('encaminha isError/refetch: a Visão geral mostra o erro e o retry refaz a consulta', () => {
    f.isError = true;
    f.error = new Error('falha de rede');
    render(<TalkXView />);

    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(screen.queryByText('Nenhuma campanha encontrada')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(f.refetchCampaigns).toHaveBeenCalledTimes(1);
  });

  it('resolvendo campanha roteada: esqueleto com aria-busy, sem o placeholder legado', () => {
    f.isLoading = true;
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=2');
    const { container } = render(<TalkXView />);

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/Carregando\s+campanha/);
    expect(screen.queryByTestId('wizard')).toBeNull();
  });
});
