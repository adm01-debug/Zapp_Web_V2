/**
 * Ajuda do Talk X (telas 16 e 01) — Esc fecha a Ajuda e o foco volta ao gatilho.
 *
 * A entrega anterior corrigia o modal antigo com DialogTrigger. Na base atual a
 * Ajuda já virou uma tela roteada (`?screen=help`), então a regra de teclado é
 * guardada no fluxo real atual: o botão "Ajuda" abre a tela, Esc fecha a tela e
 * o foco volta para o novo botão renderizado no cabeçalho do módulo.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ campaigns: [] as Array<Record<string, unknown>>, isLoading: false }));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isError: false,
    error: null,
    isLive: false,
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    refetchCampaigns: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/integrations/useTalkXServiceStatus', () => ({ useTalkXServiceStatus: () => ({ whatsapp: { connected: true } }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
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

function gatilho() {
  return screen.getByRole('button', { name: 'Ajuda' });
}

describe('Talk X — tela de Ajuda: Esc fecha e o foco volta ao gatilho', () => {
  beforeEach(() => {
    f.campaigns = [];
    f.isLoading = false;
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  afterEach(() => vi.clearAllMocks());

  it('Esc fecha a Ajuda roteada e devolve o foco ao botão "Ajuda" (nunca ao body)', async () => {
    render(<TalkXView />);
    const ajuda = gatilho();

    await act(async () => {
      ajuda.focus();
      fireEvent.click(ajuda);
    });

    expect(await screen.findByRole('heading', { name: 'Ajuda do Talk X' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ajuda do Talk X' })).not.toBeInTheDocument());
    const ajudaDepois = gatilho();
    await waitFor(() => expect(document.activeElement).toBe(ajudaDepois));
    expect(document.activeElement).not.toBe(document.body);
  });
});
