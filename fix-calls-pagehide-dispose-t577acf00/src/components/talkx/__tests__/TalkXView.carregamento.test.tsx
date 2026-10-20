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
 * Conta TODAS as telas que viraram chunk sob demanda — Analytics, Segmentos,
 * Templates, Ajuda, Construtor (wizard), Monitor ao vivo, Agendada, Em andamento,
 * Supressão e Configurações. Antes da correção o TalkXView importava as telas de uma
 * vez (onze imports estáticos): os contadores nasciam em 1 no import e o primeiro
 * teste ficava vermelho.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buscas = vi.hoisted(() => ({
  analytics: 0, segments: 0, templates: 0, help: 0,
  wizard: 0, monitor: 0, scheduled: 0, running: 0, suppression: 0, settings: 0,
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
// X194 — a Ajuda é `help/TalkXHelpCenter` (não existe `@/components/talkx/TalkXHelp`);
// o contador prova que ela também chega por chunk sob demanda.
vi.mock('@/components/talkx/help/TalkXHelpCenter', () => {
  buscas.help += 1;
  return { TalkXHelpCenter: () => <div data-testid="help" /> };
});
vi.mock('@/components/talkx/TalkXSuppression', () => {
  buscas.suppression += 1;
  return { TalkXSuppression: () => <div /> };
});
vi.mock('@/components/talkx/TalkXSettings', () => {
  buscas.settings += 1;
  return { TalkXSettings: () => <div data-testid="settings" /> };
});
vi.mock('@/components/talkx/TalkXLiveMonitor', () => {
  buscas.monitor += 1;
  return { TalkXLiveMonitor: () => <div /> };
});
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => {
  buscas.scheduled += 1;
  return { TalkXCampaignScheduled: () => <div /> };
});
vi.mock('@/components/talkx/TalkXCampaignRunning', () => {
  buscas.running += 1;
  return { TalkXCampaignRunning: () => <div /> };
});
vi.mock('@/components/talkx/TalkXCampaignWizard', () => {
  buscas.wizard += 1;
  return { TalkXCampaignWizard: () => <div /> };
});

import TalkXView from '@/components/talkx/TalkXView';

// Fotografia do import estático: com as telas importadas junto do TalkXView, os
// factories já rodaram aqui. Sob carregamento dinâmico, continuam em 0.
const buscasNoImport = { ...buscas };

const ZERADO = {
  analytics: 0, segments: 0, templates: 0, help: 0,
  wizard: 0, monitor: 0, scheduled: 0, running: 0, suppression: 0, settings: 0,
};

describe('TalkXView — carregamento sob demanda das telas (X194)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=talkx');
  });

  afterEach(() => vi.clearAllMocks());

  it('importar o TalkXView não busca a tela de nenhuma aba', () => {
    expect(buscasNoImport).toEqual(ZERADO);
  });

  it('abrir o módulo na Visão geral não busca as telas das outras abas', async () => {
    render(<TalkXView />);
    await screen.findByTestId('overview');

    expect(buscas).toEqual(buscasNoImport);
  });

  it('busca a tela — e só então a mostra — quando a aba é aberta pela barra', async () => {
    render(<TalkXView />);
    await screen.findByTestId('overview');
    const antes = { ...buscas };

    const trigger = screen.getByRole('button', { name: /Analytics/ });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('Comparativo'));

    expect(await screen.findByTestId('analytics')).toBeInTheDocument();
    await waitFor(() => expect(buscas.analytics).toBe(antes.analytics + 1));
    // nenhuma outra tela foi buscada só por abrir a aba de Analytics
    expect(buscas).toEqual({ ...antes, analytics: antes.analytics + 1 });
  });

  it('busca a Ajuda — e só então a mostra — quando o botão Ajuda do cabeçalho abre', async () => {
    render(<TalkXView />);
    await screen.findByTestId('overview');
    const antes = { ...buscas };

    fireEvent.click(screen.getByRole('button', { name: /Ajuda/ }));

    expect(await screen.findByTestId('help')).toBeInTheDocument();
    await waitFor(() => expect(buscas.help).toBe(antes.help + 1));
    expect(buscas).toEqual({ ...antes, help: antes.help + 1 });
  });
});
