import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paridade V3 → V2, Parte 7 — falha num bloco do Talk X não derruba a tela.
 *
 * A view tem dois blocos independentes que a V3 protege com
 * `SectionErrorBoundary` e que a V2 expunha: o Monitor ao vivo (branch
 * `topView === 'monitor'`) e o Analytics de campanhas (aba `analytics`).
 * Aqui os dois blocos protegidos são feitos LANÇAR para provar que o aviso
 * aparece no lugar do bloco e que o resto da tela continua de pé.
 */

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  isLoading: false,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isError: false,
    error: null,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
    refetchCampaigns: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));

// Os dois blocos protegidos lançam na renderização.
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({
  TalkXLiveMonitor: () => { throw new Error('falha do monitor'); },
}));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({
  TalkXAnalytics: () => { throw new Error('falha do analytics'); },
}));

// Vizinhos não protegidos; existem só para o resto da tela montar.
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

const done = {
  id: 'cmp_done', name: 'Finalizada', status: 'completed',
  sent_count: 10, failed_count: 0, delivered_count: 10, total_recipients: 10,
};

describe('TalkXView — SectionErrorBoundary isola o bloco que falha (Parte 7)', () => {
  beforeEach(() => {
    f.campaigns = [done];
    f.isLoading = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Analytics de campanhas lançando mostra o aviso no lugar do bloco e mantém a tela', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=analytics');
    render(<TalkXView />);

    expect(await screen.findByText(/Erro em "Analytics de campanhas"/)).toBeInTheDocument();
    // A tela não foi derrubada: o cabeçalho e as abas continuam de pé.
    expect(screen.getByText('Campanhas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova campanha/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Visão geral/ })).toBeInTheDocument();
  });

  it('Monitor ao vivo lançando mostra o aviso no lugar do bloco e mantém o botão de voltar', async () => {
    window.history.replaceState(null, '', '/?view=talkx&campaign=cmp_done&screen=monitor');
    render(<TalkXView />);

    expect(await screen.findByText(/Erro em "Monitor ao vivo"/)).toBeInTheDocument();
    // A tela do monitor não foi derrubada (não caiu na lista nem ficou vazia).
    expect(screen.getByRole('button', { name: /Voltar/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Nova campanha/ })).not.toBeInTheDocument());
  });
});
