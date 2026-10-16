import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ campaigns: [] as Array<Record<string, unknown>>, isLoading: false }));

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
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({ useTalkXInsights: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({ useContactCustomFields: () => ({ fields: [] }) }));
vi.mock('@/components/talkx/TalkXOverview', () => ({ TalkXOverview: () => <div /> }));
vi.mock('@/components/talkx/TalkXLiveMonitor', () => ({ TalkXLiveMonitor: () => <div /> }));
vi.mock('@/components/talkx/TalkXSegments', () => ({ TalkXSegments: () => <div /> }));
vi.mock('@/components/talkx/TalkXTemplates', () => ({ TalkXTemplates: () => <div /> }));
vi.mock('@/components/talkx/TalkXSuppression', () => ({ TalkXSuppression: () => <div /> }));
vi.mock('@/components/talkx/TalkXAnalytics', () => ({ TalkXAnalytics: () => <div /> }));
vi.mock('@/components/talkx/TalkXSettings', () => ({ TalkXSettings: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignScheduled', () => ({ TalkXCampaignScheduled: () => <div /> }));
vi.mock('@/components/talkx/TalkXCampaignRunning', () => ({ TalkXCampaignRunning: () => <div /> }));

/**
 * O editor é substituído por um estado pequeno e controlado: o que está sob
 * teste aqui é a navegação do wizard pela rota (TalkXCampaignWizard +
 * TalkXWizardDelivery + TalkXView reais), não o hook de dados.
 */
vi.mock('@/components/talkx/useCampaignEditor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/talkx/useCampaignEditor')>();
  const { useState } = await import('react');
  return {
    ...actual,
    useCampaignEditor: (_campaign: unknown, onClose: () => void, initial?: { step?: 1 | 2 | 3 | 4 }) => {
      const [step, setStep] = useState<1 | 2 | 3 | 4>(initial?.step ?? 1);
      return {
        step, setStep, onClose,
        canProceed: { 1: true, 2: true, 3: true, 4: true },
        saving: false, draftCampaignId: 'draft_1', draftRevision: 1,
        name: 'Campanha X134', description: '', objective: 'vendas',
        audienceSource: 'contacts', segmentIds: [], segments: [], selectedSegments: [], segmentEstimates: {},
        templateId: null, templates: [], selectedTemplate: null, templateVersionId: null,
        messageTemplate: 'Oi {{nome}}', setMessageTemplate: vi.fn(),
        typingDelay: [1, 3], setTypingDelay: vi.fn(), sendInterval: [8, 20], setSendInterval: vi.fn(),
        speedProfile: 'moderate', setSpeedProfile: vi.fn(), messagesPerMinute: 12, estimatedTime: '~5 min',
        connectionId: 'c1', setConnectionId: vi.fn(),
        connections: [{ id: 'c1', name: 'ZAPP', phone_number: '5511999999999', status: 'connected', instance_id: 'i1' }],
        selectedContacts: [], contacts: [], companies: [], tags: [], filteredContacts: [],
        audienceTotal: 100, eligibleCount: 99, suppressedCount: 1,
        isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
        setScheduledAt: vi.fn(), toggleSchedule: vi.fn(), minimumScheduledAt: '', scheduleConfigError: null,
        setScheduleTimezone: vi.fn(),
        sendWindowEnabled: false, setSendWindowEnabled: vi.fn(), sendWindowStart: '08:00', setSendWindowStart: vi.fn(),
        sendWindowEnd: '18:00', setSendWindowEnd: vi.fn(), businessHoursOnly: false, setBusinessHoursOnly: vi.fn(),
        respectSuppression: true, setRespectSuppression: vi.fn(),
        confirmConsent: true, setConfirmConsent: vi.fn(), confirmContent: true, setConfirmContent: vi.fn(),
        confirmSuppression: true, setConfirmSuppression: vi.fn(),
        hasMedia: false, mediaUrl: '', mediaType: null,
        autosaveStatus: 'idle', autosaveError: null, autosaveIsDirty: false, lastAutosave: null,
        hasUnsavedChanges: () => false, retryAutosave: vi.fn(), flushPendingAutosave: vi.fn(),
        handleSave: vi.fn(),
      };
    },
  };
});

import TalkXView from '@/components/talkx/TalkXView';

const draft = {
  id: 'draft_1', name: 'Rascunho seguro', status: 'draft', sent_count: 0,
  failed_count: 0, delivered_count: 0, total_recipients: 0,
};

describe('TalkXView — "Editar" da revisão abre o passo e volta (X134)', () => {
  beforeEach(() => {
    f.campaigns = [draft];
    f.isLoading = false;
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=4');
  });

  afterEach(() => vi.clearAllMocks());

  it('abre o passo pedido com `return=4` na rota e volta à revisão pelo botão principal', async () => {
    render(<TalkXView />);

    // Passo 4 — revisão, com o wizard real.
    expect(await screen.findByText('Resumo da campanha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar à revisão/ })).not.toBeInTheDocument();

    // "Editar" da linha Supressão → passo 3.
    await act(async () => {
      screen.getAllByRole('button', { name: /Editar/ })[3].click();
    });

    const afterEdit = new URLSearchParams(window.location.search);
    expect(afterEdit.get('step')).toBe('3');
    expect(afterEdit.get('return')).toBe('4');
    expect(screen.getByText('Configurações de agendamento')).toBeInTheDocument();

    // No passo aberto pela revisão o botão principal vira "Voltar à revisão".
    const voltar = screen.getByRole('button', { name: /Voltar à revisão/ });
    await act(async () => voltar.click());

    const afterReturn = new URLSearchParams(window.location.search);
    expect(afterReturn.get('step')).toBe('4');
    expect(afterReturn.has('return')).toBe(false);
    expect(screen.getByText('Resumo da campanha')).toBeInTheDocument();
  });

  it('o passo aberto sem "Editar" mantém o "Continuar" e não ganha destino de volta', async () => {
    window.history.replaceState(null, '', '/?view=talkx&wizard=draft_1&step=3');
    render(<TalkXView />);

    expect(await screen.findByText('Configurações de agendamento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar à revisão/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).has('return')).toBe(false);
  });
});
