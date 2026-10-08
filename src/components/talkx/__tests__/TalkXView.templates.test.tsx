import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-MOD-039 — a ação "Novo template" do menu Templates, no topo do módulo, levava ao
 * wizard de CAMPANHA (público → mensagem → entrega). O aceite é: clicar abre o editor de
 * template VAZIO e salvar cria somente um template.
 *
 * A prova renderiza o TalkXView real com a aba de templates e o editor REAIS (só as
 * consultas e as telas irmãs são mockadas): o clique tem de produzir o editor de template
 * e nenhum wizard de campanha.
 */

const f = vi.hoisted(() => ({ templates: [] as Array<Record<string, unknown>> }));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: f.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
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
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));

// O wizard de campanha fica marcado por um data-testid: o ponto do cartão é que ele NÃO
// aparece neste caminho.
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({
  TalkXCampaignWizard: () => <section data-testid="campaign-wizard" />,
}));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div data-testid="overview" /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';

function abrirMenuTemplates() {
  const trigger = screen.getByRole('button', { name: /Templates/ });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

describe('TalkXView — menu Templates ▾ → Novo template (R2-MOD-039)', () => {
  beforeEach(() => {
    f.templates = [];
    window.history.replaceState(null, '', '/?view=talkx');
  });

  afterEach(() => vi.clearAllMocks());

  it('abre o editor de template vazio e não o wizard de campanha', async () => {
    render(<TalkXView />);

    abrirMenuTemplates();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Novo template' }));

    // Editor REAL da trilha de templates, em modo "novo".
    expect(await screen.findByText('Salvar template')).toBeInTheDocument();
    expect(screen.getByText('Nome do Template')).toBeInTheDocument();
    expect(screen.getByText('Mensagem')).toBeInTheDocument();

    // Nenhum passo de campanha (público → mensagem → entrega).
    expect(screen.queryByTestId('campaign-wizard')).not.toBeInTheDocument();

    const params = new URLSearchParams(window.location.search);
    expect(params.get('tab')).toBe('templates');
    expect(params.has('wizard')).toBe(false);
    expect(params.has('step')).toBe(false);
  });

  it('não reabre o editor ao revisitar a aba; a Biblioteca continua mostrando a lista', async () => {
    render(<TalkXView />);

    abrirMenuTemplates();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Novo template' }));
    await screen.findByText('Salvar template');

    // Sai para a visão geral e volta pela Biblioteca: a aba não pode reabrir o editor sozinho.
    const visaoGeral = screen.getByRole('tab', { name: /Visão geral/ });
    fireEvent.mouseDown(visaoGeral);
    fireEvent.click(visaoGeral);
    await screen.findByTestId('overview');

    abrirMenuTemplates();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Biblioteca' }));

    expect(await screen.findByText('Nenhum template criado')).toBeInTheDocument();
    expect(screen.queryByText('Salvar template')).not.toBeInTheDocument();
  });
});
