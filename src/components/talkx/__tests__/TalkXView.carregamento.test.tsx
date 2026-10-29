/**
 * X194 — carregamento sob demanda das telas do Talk X.
 *
 * Prova que abrir o módulo NÃO busca as telas das abas que não estão abertas e que
 * cada tela só é buscada quando a aba/visão que a usa abre.
 *
 * O contador é incrementado dentro do factory de cada módulo mockado: o Vitest roda
 * o factory na PRIMEIRA importação do módulo. Import estático = na avaliação do
 * TalkXView, antes de qualquer render; import dinâmico (React.lazy) = só quando a
 * aba abre. Por isso o valor é lido logo depois do import abaixo (`buscasNoImport`)
 * e comparado dentro do teste — zerar o contador no `beforeEach` esconderia a prova.
 *
 * Antes da correção o TalkXView importava as onze telas de uma vez: os três
 * contadores nasciam em 1 no import e o primeiro teste ficava vermelho.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buscas = vi.hoisted(() => ({ analytics: 0, segments: 0, templates: 0 }));

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
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));

vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXSegments', () => {
  buscas.segments += 1;
  return { TalkXSegments: () => <div data-testid="segments" /> };
});
vi.mock('@/components/talkx/TalkXTemplates', () => {
  buscas.templates += 1;
  return { TalkXTemplates: () => <div data-testid="templates" /> };
});
vi.mock('@/components/talkx/TalkXAnalytics', () => {
  buscas.analytics += 1;
  return { TalkXAnalytics: () => <div data-testid="analytics" /> };
});
vi.mock('@/components/talkx/TalkXHelp', () => ({ TalkXHelp: () => <div data-testid="help" /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({ TalkXCampaignWizard: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

// Fotografia do import estático: com as telas importadas junto do TalkXView, os
// factories já rodaram aqui. Sob carregamento dinâmico, continuam em 0.
const buscasNoImport = { ...buscas };

describe('TalkXView — carregamento sob demanda das telas (X194)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=talkx');
  });

  afterEach(() => vi.clearAllMocks());

  it('importar o TalkXView não busca a tela de nenhuma aba', () => {
    expect(buscasNoImport).toEqual({ analytics: 0, segments: 0, templates: 0 });
  });

  it('abrir o módulo na Visão geral não busca as telas das outras abas', async () => {
    render(<TalkXView />);
    await screen.findByTestId('overview');

    expect(buscas.segments).toBe(buscasNoImport.segments);
    expect(buscas.templates).toBe(buscasNoImport.templates);
    expect(buscas.analytics).toBe(buscasNoImport.analytics);
  });

  it('busca a tela — e só então a mostra — quando a aba é aberta pela barra', async () => {
    render(<TalkXView />);
    await screen.findByTestId('overview');
    const antes = buscas.analytics;

    const trigger = screen.getByRole('button', { name: /Analytics/ });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('Comparativo'));

    expect(await screen.findByTestId('analytics')).toBeInTheDocument();
    await waitFor(() => expect(buscas.analytics).toBe(antes + 1));
  });
});
