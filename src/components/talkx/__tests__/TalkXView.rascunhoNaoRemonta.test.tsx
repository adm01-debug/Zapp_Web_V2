import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Defeito (E2E logado, webkit-talkx talkx.spec.ts:213 instável): o primeiro
// autosave de uma campanha nova troca a rota de wizard=new para wizard=<id>; quando
// a lista de campanhas volta com a linha, a key do wizard mudava de
// `talkx-wizard:new` para `talkx-wizard:<id>` e o editor era REMONTADO, descartando
// o que o usuário mudou depois do autosave (ex.: origem "Segmento salvo").

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  montagens: 0,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: false,
    isError: false,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
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
  TalkXCampaignWizard: ({ campaign, onDraftIdentity }: {
    campaign: { id?: string } | null; onDraftIdentity?: (id: string) => void;
  }) => {
    useEffect(() => { f.montagens += 1; }, []);
    return (
      <section data-testid="wizard" data-campaign-id={campaign?.id ?? 'new'}>
        <button type="button" onClick={() => onDraftIdentity?.('draft_novo')}>Simular autosave</button>
      </section>
    );
  },
}));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignPaused', () => ({ TalkXCampaignPaused: () => <div /> }));
vi.mock('@/components/talkx/report/TalkXCampaignReport', () => ({ TalkXCampaignReport: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

const rascunhoDoServidor = {
  id: 'draft_novo', name: 'Campanha nova', status: 'draft', sent_count: 0,
  failed_count: 0, delivered_count: 0, total_recipients: 0,
};

describe('TalkXView — rascunho criado pelo próprio editor', () => {
  beforeEach(() => {
    f.campaigns = [];
    f.montagens = 0;
    window.history.replaceState(null, '', '/?view=talkx&wizard=new&step=1');
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('o primeiro autosave e o refetch da lista NÃO remontam o editor', async () => {
    const { rerender } = render(<TalkXView />);
    await screen.findByTestId('wizard');
    expect(f.montagens).toBe(1);

    // Primeiro autosave: o editor informa a identidade do rascunho criado.
    await act(async () => screen.getByRole('button', { name: 'Simular autosave' }).click());
    expect(new URLSearchParams(window.location.search).get('wizard')).toBe('draft_novo');

    // O refetch da lista de campanhas traz a linha recém-criada.
    f.campaigns = [rascunhoDoServidor];
    await act(async () => { rerender(<TalkXView />); });

    expect(screen.getByTestId('wizard')).toBeInTheDocument();
    expect(f.montagens).toBe(1);
  });

  it('reabrir o mesmo rascunho pela rota (recarga) continua hidratando do servidor', async () => {
    f.campaigns = [rascunhoDoServidor];
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_novo&step=1');
    render(<TalkXView />);
    const wizard = await screen.findByTestId('wizard');
    expect(wizard).toHaveAttribute('data-campaign-id', 'draft_novo');
  });
});
