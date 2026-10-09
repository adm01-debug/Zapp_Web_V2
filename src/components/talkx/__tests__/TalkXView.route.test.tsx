import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  isLoading: false,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: f.campaigns,
    isLoading: f.isLoading,
    isLive: false,
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({ useTalkXSegments: () => ({ segments: [] }) }));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/crm/useTeamProfiles', () => ({ useTeamProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));
vi.mock('@/components/talkx/TalkXCampaignWizard', () => ({
  TalkXCampaignWizard: ({ campaign, initial, onClose }: { campaign: { id?: string } | null; initial?: { step?: number }; onClose: () => void }) => (
    <section data-testid="wizard" data-campaign-id={campaign?.id ?? 'new'} data-step={initial?.step}>
      <button type="button" onClick={onClose}>Fechar wizard</button>
    </section>
  ),
}));
vi.mock('@/components/talkx/TalkXOverview', () => ({
  TalkXOverview: ({ onNew }: { onNew: () => void }) => <button type="button" onClick={onNew}>Abrir novo wizard</button>,
}));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div data-testid="suppression" /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div data-testid="analytics" /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div data-testid="settings" /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

import TalkXView from '@/components/talkx/TalkXView';
import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import { replaceTalkXWizardRoute } from '@/components/talkx/talkxWizardRoute';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

const draft = {
  id: 'draft_1', name: 'Rascunho seguro', status: 'draft', sent_count: 0,
  failed_count: 0, delivered_count: 0, total_recipients: 0,
};

describe('TalkXView wizard route integration', () => {
  beforeEach(() => {
    f.campaigns = [draft];
    f.isLoading = false;
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=3');
  });

  afterEach(() => vi.clearAllMocks());

  it('restores the routed draft and its requested step on first render', async () => {
    render(<TalkXView />);
    const wizard = await screen.findByTestId('wizard');
    expect(wizard).toHaveAttribute('data-campaign-id', 'draft_1');
    expect(wizard).toHaveAttribute('data-step', '3');
  });

  it('handles browser history changes without retaining the previous campaign', async () => {
    const second = { ...draft, id: 'draft_2', name: 'Outro rascunho' };
    f.campaigns = [draft, second];
    render(<TalkXView />);
    await screen.findByTestId('wizard');

    await act(async () => {
      window.history.replaceState(null, '', '/?view=talkx&wizard=draft_2&step=2');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('wizard')).toHaveAttribute('data-campaign-id', 'draft_2');
      expect(screen.getByTestId('wizard')).toHaveAttribute('data-step', '2');
    });
  });

  it('clears an inaccessible campaign route instead of opening an arbitrary editor', async () => {
    f.campaigns = [];
    render(<TalkXView />);

    await waitFor(() => expect(screen.queryByTestId('wizard')).not.toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).has('wizard')).toBe(false);
    expect(new URLSearchParams(window.location.search).has('step')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('view')).toBe('talkx');
  });

  it('cleans wizard parameters on explicit exit', async () => {
    render(<TalkXView />);
    await screen.findByTestId('wizard');
    await act(async () => screen.getByRole('button', { name: 'Fechar wizard' }).click());

    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?view=talkx');
  });

  it('leaves the editor when browser history returns to the campaign list', async () => {
    render(<TalkXView />);
    await screen.findByTestId('wizard');

    await act(async () => {
      window.history.replaceState(null, '', '/?view=talkx');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(screen.queryByTestId('wizard')).not.toBeInTheDocument());
  });
});

describe('TalkXView tab deep links (X007)', () => {
  beforeEach(() => {
    f.campaigns = [draft];
    f.isLoading = false;
  });

  afterEach(() => vi.clearAllMocks());

  it('?tab=suppression abre a supressão', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=suppression');
    render(<TalkXView />);
    await waitFor(() => expect(screen.getByTestId('suppression')).toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('suppression');
  });

  it('Analytics ▾ → Configurações grava tab=analytics&sub=configuracoes', async () => {
    window.history.replaceState(null, '', '/?view=talkx');
    render(<TalkXView />);

    const trigger = screen.getByRole('button', { name: /Analytics/ });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    const configuracoes = await screen.findByText('Configurações');
    fireEvent.click(configuracoes);

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('tab')).toBe('analytics');
      expect(new URLSearchParams(window.location.search).get('sub')).toBe('configuracoes');
    });
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('voltar no navegador restaura a aba', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=suppression');
    render(<TalkXView />);
    await waitFor(() => expect(screen.getByTestId('suppression')).toBeInTheDocument());

    await act(async () => {
      window.history.pushState(null, '', '/?view=talkx&tab=analytics');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.getByTestId('analytics')).toBeInTheDocument());

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.getByTestId('suppression')).toBeInTheDocument());
  });
});

/** `ed` mínimo só para renderizar a revisão (V22). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha V22', description: '', objective: 'sales',
    audienceSource: 'contacts', selectedSegment: null,
    selectedContacts: [], eligibleCount: 10, audienceTotal: 12,
    respectSuppression: true, suppressedCount: 2,
    selectedTemplate: null, messageTemplate: 'Oi {{nome}}',
    speedProfile: 'normal', messagesPerMinute: 20, estimatedTime: '5 min',
    isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
    sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00',
    businessHoursOnly: false,
    connectionId: 'c1', connections: [{ id: 'c1', name: 'Conexão', phone_number: '5511999999999' }],
    contacts: [],
    confirmConsent: true, confirmContent: true, confirmSuppression: true,
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    saving: false, hasMedia: false, mediaUrl: '', mediaType: null,
    handleSave: vi.fn(), setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

// V22/X134 — os botões "Editar" da revisão precisam navegar pela rota
// (onEditStep → requestStep no wizard), nunca por ed.setStep: o efeito de rota
// do wizard (TalkXCampaignWizard) reverte um passo que não tenha ido para a URL.
// O segundo argumento (`returnTo = 4`) é o destino do botão "Voltar à revisão".
describe('TalkXWizardReview — "Editar" respeita a rota (V22/X134)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=4');
  });

  afterEach(() => vi.clearAllMocks());

  it('navega pela rota com o passo da linha e o destino de volta (sem tocar em ed.setStep)', async () => {
    const setStep = vi.fn();
    const onEditStep = vi.fn((step: 1 | 2 | 3, returnTo: 4) => {
      replaceTalkXWizardRoute({ campaignId: 'draft_1', step, returnTo });
    });

    render(
      <TalkXWizardReview
        ed={reviewEd({ setStep })}
        campaign={draft as never}
        onLaunched={() => {}}
        onEditStep={onEditStep}
      />
    );

    await act(async () => {
      screen.getAllByRole('button', { name: /Editar/ })[0].click();
    });

    expect(setStep).not.toHaveBeenCalled();
    expect(onEditStep).toHaveBeenCalledWith(1, 4);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('step')).toBe('1');
    expect(params.get('return')).toBe('4');
  });

  it('cada linha navega para o seu próprio passo (template → 2)', async () => {
    const onEditStep = vi.fn();
    render(
      <TalkXWizardReview
        ed={reviewEd()}
        campaign={draft as never}
        onLaunched={() => {}}
        onEditStep={onEditStep}
      />
    );

    // Ordem das linhas: 0 Nome(1), 1 Objetivo(1), 2 Público(1), 3 Supressão(3),
    // 4 Template(2) — a 5ª linha.
    await act(async () => {
      screen.getAllByRole('button', { name: /Editar/ })[4].click();
    });

    expect(onEditStep).toHaveBeenCalledWith(2, 4);
  });
});

// X134/T09-012, T09-013, T09-018, T09-020 — as linhas do resumo mostram o dado
// real do estado, não um texto fixo.
describe('TalkXWizardReview — linhas com dado real (X134)', () => {
  afterEach(() => vi.clearAllMocks());

  it('Objetivo mostra a descrição do objetivo e a descrição livre da campanha', async () => {
    render(
      <TalkXWizardReview
        ed={reviewEd({ objective: 'vendas', description: 'Turma de outubro' })}
        campaign={draft as never}
        onLaunched={() => {}}
      />
    );

    expect(screen.getByText('Vendas')).toBeInTheDocument();
    expect(screen.getByText('Gerar mais vendas e conversões · Turma de outubro')).toBeInTheDocument();
  });

  it('Segmentos selecionados mostra os nomes e "N segmentos | X contatos"', async () => {
    render(
      <TalkXWizardReview
        ed={reviewEd({
          audienceSource: 'segment',
          selectedSegment: { id: 'seg_1', name: 'VIP', estimated_count: 1250 },
          eligibleCount: 1200,
        })}
        campaign={draft as never}
        onLaunched={() => {}}
      />
    );

    expect(screen.getByText('Segmentos selecionados')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('1 segmento | 1.200 contatos')).toBeInTheDocument();
  });

  it('Agendamento mostra o dia relativo e quanto falta ("Hoje, 16:12 · Em 5 minutos")', async () => {
    vi.useFakeTimers();
    // 09/10/2026 16:07 em São Paulo (UTC-03:00) → o agendamento é 5 min depois.
    vi.setSystemTime(new Date('2026-10-09T19:07:00.000Z'));
    try {
      render(
        <TalkXWizardReview
          ed={reviewEd({
            isScheduled: true,
            scheduledAt: '2026-10-09T16:12',
            scheduleTimezone: 'America/Sao_Paulo',
          })}
          campaign={draft as never}
          onLaunched={() => {}}
        />
      );

      expect(screen.getByText('Hoje, 16:12 (America/Sao_Paulo)')).toBeInTheDocument();
      expect(screen.getByText('Em 5 minutos · Sem janela de envio')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Conformidade lista o resultado das checagens reais do operador', async () => {
    render(
      <TalkXWizardReview
        ed={reviewEd({ respectSuppression: true, confirmConsent: false })}
        campaign={draft as never}
        onLaunched={() => {}}
      />
    );

    expect(screen.getByText('Pendente: consentimento dos contatos')).toBeInTheDocument();
  });
});
