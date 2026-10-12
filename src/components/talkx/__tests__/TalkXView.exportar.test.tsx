import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** X168 — "Exportar relatório" só aparece para admin/supervisor com `can_download`. */
const f = vi.hoisted(() => ({ canDownload: false, isSupervisor: false }));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: f.canDownload, isLoading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: f.isSupervisor }) }));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [], isLoading: false, isError: false, error: null, isLive: false, refetchCampaigns: vi.fn(),
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() }, duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));

import TalkXView from '../TalkXView';

describe('TalkXView — Exportar relatório (X168)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
  });

  it.each([
    { canDownload: false, isSupervisor: true },
    { canDownload: true, isSupervisor: false },
  ])('ausente com %j', (state) => {
    Object.assign(f, state);
    render(<TalkXView />);
    expect(screen.queryByText('Exportar relatório')).toBeNull();
  });

  it('visível para supervisor com can_download', () => {
    Object.assign(f, { canDownload: true, isSupervisor: true });
    render(<TalkXView />);
    expect(screen.getByText('Exportar relatório')).toBeTruthy();
  });
});
