import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Defeito: no passo "Público" os cartões de origem do público não diziam ao
// leitor de tela qual estava selecionado (faltava `aria-pressed`) e os campos
// "Nome da campanha" e "Descrição" não estavam ligados aos rótulos (sem
// `htmlFor`/`id`), então clicar no rótulo não focava o campo e o leitor de tela
// não anunciava o nome do campo.
const h = vi.hoisted(() => ({ ed: {} as Record<string, unknown> }));

vi.mock('@/components/talkx/useCampaignEditor', () => ({
  useCampaignEditor: () => ({
    ...h.ed,
    step: 1,
    setStep: vi.fn(),
    hasUnsavedChanges: () => false,
    discardPendingChanges: vi.fn(),
    handleSave: vi.fn(() => Promise.resolve('draft_1')),
  }),
  VARIABLES: [],
  MESSAGE_TEMPLATES: [],
  MEDIA_TYPES: [],
  DEFAULT_SCHEDULE_TIMEZONE: 'America/Sao_Paulo',
  CAMPAIGN_NAME_MIN_LENGTH: 3,
  CAMPAIGN_NAME_MAX_LENGTH: 200,
  MESSAGE_LIMIT: 4096,
  MORE_VARIABLES: [],
  explainDraftSaveError: (message: string | null | undefined) => message ?? null,
  completedRules: (rules: { groups: unknown[] }) => rules,
}));

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useAudienceEstimate: () => ({ data: undefined, isFetching: false }),
  RULE_FIELDS: [{ value: 'company', label: 'Empresa', kind: 'text' }],
  RULE_OPS: { text: [{ value: 'eq', label: 'é' }] },
}));
vi.mock('@/hooks/integrations/useTalkXCampaignSummary', () => ({
  useTalkXCampaignSummary: () => ({
    total: 0, eligible: 0, suppressed: 0, isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess: () => false }));
vi.mock('@/hooks/integrations/useTalkXLinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXLinks')>();
  return {
    ...actual,
    useTalkXLinks: () => ({
      links: [], clicks: {}, isLoading: false, isError: false, error: null,
      refetch: vi.fn(),
      upsertLink: { mutate: vi.fn(), isPending: false },
      deleteLink: { mutate: vi.fn(), isPending: false },
    }),
  };
});

import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';

/** Estado mínimo para o passo 1 ("Público") renderizar. */
function editorState() {
  return {
    saving: false,
    name: 'Campanha Alfa', setName: vi.fn(),
    description: 'Produtos de escritório', setDescription: vi.fn(),
    objective: 'sales', setObjective: vi.fn(),
    audienceSource: 'segment', setAudienceSource: vi.fn(),
    segments: [{ id: 's1', name: 'Clientes ativos', status: 'active', estimated_count: 10 }],
    segmentIds: [], setSegmentIds: vi.fn(), segmentSearch: '', setSegmentSearch: vi.fn(), toggleSegmentId: vi.fn(),
    selectedSegments: [], segmentEstimates: {},
    audienceCount: 10,
    audienceRules: { groups: [{ id: 'g1', match: 'and', rules: [] }] },
    addAudienceRule: vi.fn(), updateAudienceRule: vi.fn(), removeAudienceRule: vi.fn(), setGroupMatch: vi.fn(),
    contactSearch: '', setContactSearch: vi.fn(),
    companyFilter: 'all', setCompanyFilter: vi.fn(),
    companies: [], filteredContacts: [], toggleContact: vi.fn(), selectAll: vi.fn(), clearFilters: vi.fn(),
    templates: [], templateId: '', applyTemplate: vi.fn(), selectedTemplate: null,
    messageTemplate: '', setMessageTemplate: vi.fn(), insertVariable: vi.fn(),
    mediaUrl: '', setMediaUrl: vi.fn(), mediaType: '', setMediaType: vi.fn(), hasMedia: false, toggleMedia: vi.fn(),
    connectionId: 'c1', setConnectionId: vi.fn(),
    connections: [{ id: 'c1', name: 'Linha principal', phone_number: '5511999999999' }],
    owner: null, setOwner: vi.fn(), owners: [],
    contacts: [], selectedContacts: [], audienceTotal: 12, eligibleCount: 10,
    suppressedCount: 2, respectSuppression: true, setRespectSuppression: vi.fn(),
    messagesPerMinute: 20, estimatedTime: '5 min',
    typingDelay: [1.5, 4], setTypingDelay: vi.fn(), sendInterval: [8, 20], setSendInterval: vi.fn(),
    speedProfile: 'moderate', setSpeedProfile: vi.fn(),
    isScheduled: false, scheduledAt: '', setScheduledAt: vi.fn(),
    scheduleTimezone: 'America/Sao_Paulo', setScheduleTimezone: vi.fn(),
    scheduleConfigError: null, minimumScheduledAt: '2026-10-09T10:00',
    sendWindowEnabled: false, setSendWindowEnabled: vi.fn(),
    sendWindowStart: '08:00', setSendWindowStart: vi.fn(), sendWindowEnd: '18:00', setSendWindowEnd: vi.fn(),
    businessHoursOnly: false, setBusinessHoursOnly: vi.fn(), toggleSchedule: vi.fn(),
    confirmConsent: true, setConfirmConsent: vi.fn(),
    confirmContent: true, setConfirmContent: vi.fn(),
    confirmSuppression: true, setConfirmSuppression: vi.fn(),
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    draftCampaignId: 'draft_1',
  };
}

describe('TalkXCampaignWizard — acessibilidade do passo "Público"', () => {
  beforeEach(() => {
    Object.assign(h.ed, editorState());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('anuncia qual origem do público está selecionada', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Segmento salvo/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Contatos ZAPP/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('liga os campos "Nome da campanha" e "Descrição" aos seus rótulos', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Nome da campanha')).toHaveValue('Campanha Alfa');
    expect(screen.getByLabelText('Descrição (opcional)')).toHaveValue('Produtos de escritório');
  });
});
