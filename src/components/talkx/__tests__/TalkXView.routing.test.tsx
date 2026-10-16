import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * X156/T13 — roteamento por status no contêiner do Talk X.
 *
 * O que este teste trava:
 *  - campanha `paused` abre a tela própria (`TalkXCampaignPaused`), NUNCA a
 *    genérica "Campanha em Andamento" (`TalkXCampaignRunning`) — regressão do
 *    defeito que dava título errado e nenhum controle de retomada;
 *  - a ação de linha (que decide o destino por status antes de chegar aqui)
 *    também desvia `paused` para a tela própria;
 *  - campanha `sending` continua na genérica (sem regressão).
 */

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: false, isError: false, error: null, isLive: true,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: vi.fn(), duplicateCampaign: vi.fn(), refetchCampaigns: vi.fn(),
  }),
}));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/integrations/useTalkXServiceStatus', () => ({ useTalkXServiceStatus: () => ({ whatsapp: { connected: true }, isLoading: false }) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('../TalkXCampaignPaused', () => ({
  TalkXCampaignPaused: ({ campaignId, pausedByName }: { campaignId: string; pausedByName?: string | null }) => (
    <div data-testid="paused" data-campaign={campaignId} data-by={pausedByName ?? ''} />
  ),
}));
vi.mock('../TalkXCampaignRunning', () => ({
  TalkXCampaignRunning: ({ initialCampaignId }: { initialCampaignId: string | null }) => (
    <div data-testid="running" data-campaign={initialCampaignId ?? ''} />
  ),
}));
vi.mock('../TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div data-testid="scheduled" /> }));
vi.mock('../TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div data-testid="monitor" /> }));
vi.mock('../TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div data-testid="wizard" /> }));
vi.mock('../TalkXSegments', () => ({ TalkXSegments: () => null }));
vi.mock('../TalkXTemplates', () => ({ TalkXTemplates: () => null }));
vi.mock('../TalkXSuppression', () => ({ TalkXSuppression: () => null }));
vi.mock('../TalkXAnalytics', () => ({ TalkXAnalytics: () => null }));
vi.mock('../TalkXSettings', () => ({ TalkXSettings: () => null }));
vi.mock('../help/TalkXHelpCenter', () => ({ TalkXHelpCenter: () => null }));

// O Overview é a origem do clique: expõe os handlers para as duas rotas.
vi.mock('../TalkXOverview', () => ({
  TalkXOverview: (p: { campaigns: Array<Record<string, unknown>>; onView: (c: unknown) => void; onViewRunning: (c: unknown) => void }) => (
    <div>
      <button data-testid="view-paused" onClick={() => p.onView(p.campaigns[0])} />
      <button data-testid="view-running-paused" onClick={() => p.onViewRunning(p.campaigns[0])} />
      <button data-testid="view-sending" onClick={() => p.onView(p.campaigns[1])} />
    </div>
  ),
}));

import TalkXView from '../TalkXView';

const paused = { id: 'camp-paused', name: 'Pausada', status: 'paused', paused_at: '2026-09-06T10:00:00Z', paused_by: null };
const sending = { id: 'camp-sending', name: 'Enviando', status: 'sending' };

describe('TalkXView — roteamento por status (X156/T13)', () => {
  beforeEach(() => { h.campaigns = [paused, sending]; });

  it('campanha paused abre a tela própria, não a genérica "em andamento"', () => {
    render(<TalkXView />);
    fireEvent.click(screen.getByTestId('view-paused'));
    expect(screen.getByTestId('paused').dataset.campaign).toBe('camp-paused');
    expect(screen.queryByTestId('running')).toBeNull();
  });

  it('a ação de linha também desvia paused para a tela própria', () => {
    render(<TalkXView />);
    fireEvent.click(screen.getByTestId('view-running-paused'));
    expect(screen.getByTestId('paused').dataset.campaign).toBe('camp-paused');
    expect(screen.queryByTestId('running')).toBeNull();
  });

  it('campanha sending continua na genérica (sem regressão)', () => {
    render(<TalkXView />);
    fireEvent.click(screen.getByTestId('view-sending'));
    expect(screen.getByTestId('running').dataset.campaign).toBe('camp-sending');
    expect(screen.queryByTestId('paused')).toBeNull();
  });
});
