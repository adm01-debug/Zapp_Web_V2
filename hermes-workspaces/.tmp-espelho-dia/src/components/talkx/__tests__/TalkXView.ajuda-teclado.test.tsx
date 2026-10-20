import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: false,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div data-testid="monitor" /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div data-testid="wizard" /> }));

import TalkXView from '@/components/talkx/TalkXView';

const BUSCA_PLACEHOLDER = 'O que você precisa de ajuda hoje?';
const TITULO_AJUDA = 'Ajuda do Talk X';

async function abrirAjuda() {
  const gatilho = await screen.findByRole('button', { name: 'Ajuda' });
  fireEvent.click(gatilho);
  expect(await screen.findByRole('heading', { name: TITULO_AJUDA })).toBeTruthy();
  return gatilho;
}

describe('Ajuda do Talk X — teclado e foco (telas 16 e 01)', () => {
  beforeEach(() => {
    f.campaigns = [];
    window.history.replaceState(null, '', '/?view=talkx');
  });

  afterEach(() => vi.clearAllMocks());

  it('Esc fecha a Ajuda e devolve o foco ao botão que a abriu', async () => {
    render(<TalkXView />);
    await abrirAjuda();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('heading', { name: TITULO_AJUDA })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ajuda' })),
    );
  });

  it('Esc com a busca escrita limpa a busca e mantém a Ajuda aberta', async () => {
    render(<TalkXView />);
    await abrirAjuda();

    const campo = await screen.findByPlaceholderText(BUSCA_PLACEHOLDER);
    fireEvent.change(campo, { target: { value: 'campanha' } });
    expect((campo as HTMLInputElement).value).toBe('campanha');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect((campo as HTMLInputElement).value).toBe(''));
    expect(screen.getByRole('heading', { name: TITULO_AJUDA })).toBeTruthy();
  });
});
