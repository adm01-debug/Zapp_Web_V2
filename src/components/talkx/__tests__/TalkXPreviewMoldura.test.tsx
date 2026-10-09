import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X132 / TL-144 — "Prévia em moldura de celular, contato de amostra real e
 * 'Ver no celular'".
 *
 * A prova renderiza os componentes REAIS (wizard, revisão e tela Agendada) e
 * olha o que o operador vê: a moldura do kit com o cabeçalho da conexão
 * escolhida, o texto da mensagem já personalizado com o contato de amostra da
 * RPC de audiência e o envio de teste pelo botão.
 */
const f = vi.hoisted(() => ({
  contacts: [
    { id: 'contact-1', name: 'Ana Silva', nickname: null, phone: '5511999999999', company: 'Acme', avatar_url: null, tags: ['VIP'] },
  ],
  connections: [
    { id: 'connection-1', name: 'Linha Comercial', phone_number: '551140028922', status: 'connected', instance_id: 'evolution-principal' },
  ],
  profile: { id: 'profile-1', name: 'Ana Autora', email: 'ana@example.com', phone: '5541999001234' },
  testTemplate: vi.fn(async () => ({ success: true })),
  campaign: {
    id: 'camp-1', name: 'Lançamento Office', status: 'scheduled',
    scheduled_at: '2026-10-10T12:00:00.000Z', schedule_timezone: 'America/Sao_Paulo',
    send_window_start: null, send_window_end: null, business_hours_only: false,
    total_recipients: 120, message_template: 'Olá {{nome}}! Temos uma novidade para a {{empresa}}.',
    media_url: null, media_type: null, whatsapp_connection_id: 'connection-1', speed_profile: 'moderate',
  },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [f.campaign],
    isLoading: false, isError: false, error: null, isFetching: false, isLive: false,
    createCampaign: { mutateAsync: vi.fn() },
    updateCampaign: { mutateAsync: vi.fn() },
    saveDraftCampaign: { mutateAsync: vi.fn(async () => ({ campaignId: 'camp-1', revision: 1, creationReplayed: false })) },
    replaceDraftRecipients: { mutateAsync: vi.fn() },
    snapshotDraftAudience: { mutateAsync: vi.fn(async () => ({ eligible: 1, suppressed: 0, skipped_invalid: 0 })) },
    startCampaign: vi.fn(async () => true),
    refetchCampaigns: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({ segments: [] }),
    resolveAudience: vi.fn(async () => f.contacts),
    countAudience: vi.fn(async () => f.contacts.length),
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, profile: f.profile, loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), refreshProfile: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [], registerUse: vi.fn(), fetchVersionHistory: vi.fn(async () => []),
    createTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    updateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    duplicateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    testTemplate: f.testTemplate,
    fetchVariants: vi.fn(async () => []), saveVariant: vi.fn(), deleteVariant: vi.fn(), countVariantRecipients: vi.fn(async () => 0),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({ useTalkXEventLogger: () => vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({ useExternalContact360Batch: () => ({ batchData: new Map(), lookup: () => undefined, isLoading: false, isConfigured: false }) }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = String(options.queryKey?.[0]);
    const data = key === 'wa-connections-talkx' ? f.connections
      : key === 'talkx-audience-contacts' ? f.contacts
        : key === 'talkx-audience-count' ? f.contacts.length
          : key === 'talkx-audience-estimate' ? { count: f.contacts.length, sample: f.contacts, incompleteCount: 0 }
            : key === 'talkx-draft-recipient-ids' ? []
              : undefined;
    return { data, isFetching: false };
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() }),
}));

import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';
import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import { TalkXCampaignScheduled } from '@/components/talkx/TalkXCampaignScheduled';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

const MESSAGE = 'Olá {{nome}}! Temos uma novidade para a {{empresa}}.';

/** `ed` mínimo para a revisão final (passo 4) renderizar o resumo e a prévia. */
function reviewState(): WizardState {
  return {
    previewSample: f.contacts[0],
    messageTemplate: MESSAGE,
    hasMedia: false, mediaUrl: '', mediaType: '',
    connections: f.connections, connectionId: 'connection-1',
    eligibleCount: 120, audienceTotal: 120, suppressedCount: 0,
    audienceSource: 'contacts', selectedContacts: ['contact-1'], selectedSegment: null,
    respectSuppression: true,
    name: 'Lançamento Office', objective: 'promocao', description: '',
    selectedTemplate: null, speedProfile: 'moderate', messagesPerMinute: 20,
    isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
    sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00', businessHoursOnly: false,
    confirmConsent: true, confirmContent: true, confirmSuppression: true,
    setConfirmConsent: vi.fn(), setConfirmContent: vi.fn(), setConfirmSuppression: vi.fn(),
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    saving: false,
    estimatedTime: '6 min',
    handleSave: vi.fn(async () => 'camp-1'),
  } as unknown as WizardState;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('X132 — prévia da campanha em moldura de celular', () => {
  it('o rail do wizard usa a moldura do kit com o nome e o número da conexão escolhida', () => {
    render(<TalkXCampaignWizard campaign={{ id: 'draft-1', name: 'Teste', status: 'draft', message_template: MESSAGE } as never} onClose={vi.fn()} />);

    // A moldura (não a bolha solta) está na tela, com o cromo do telefone.
    expect(screen.getByTestId('talkx-phone-frame')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Mensagem…')).toBeInTheDocument();
    // Cabeçalho como o contato vê: nome e número da conexão.
    expect(screen.getByText('Linha Comercial')).toBeInTheDocument();
    expect(screen.getByText('551140028922')).toBeInTheDocument();
  });

  it('a amostra da prévia é o contato real da audiência, com as variáveis resolvidas', () => {
    render(<TalkXCampaignWizard campaign={{ id: 'draft-1', name: 'Teste', status: 'draft', message_template: MESSAGE } as never} onClose={vi.fn()} />);

    expect(screen.getByText('Exemplo com Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Olá Ana! Temos uma novidade para a Acme.')).toBeInTheDocument();
  });

  it('"Ver no celular" abre o pedido de número pré-preenchido e envia o teste personalizado', async () => {
    render(<TalkXCampaignWizard campaign={{ id: 'draft-1', name: 'Teste', status: 'draft', message_template: MESSAGE } as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver no celular/ }));

    // Pré-preenchido com o telefone do perfil.
    expect(screen.getByLabelText('Número de destino')).toHaveValue('5541999001234');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(f.testTemplate).toHaveBeenCalledTimes(1);
    expect(f.testTemplate).toHaveBeenCalledWith(expect.objectContaining({
      phone: '5541999001234',
      templateContent: 'Olá Ana! Temos uma novidade para a Acme.',
    }));
    expect(await screen.findByText('Mensagem enviada para 5541999001234')).toBeInTheDocument();
  });

  it('a revisão final mostra a mesma moldura, com o cabeçalho da conexão', () => {
    render(<TalkXWizardReview ed={reviewState()} campaign={null} onLaunched={vi.fn()} />);

    expect(screen.getByTestId('talkx-phone-frame')).toBeInTheDocument();
    expect(screen.getByText('Linha Comercial')).toBeInTheDocument();
    expect(screen.getByText('551140028922')).toBeInTheDocument();
    expect(screen.getByText('Olá Ana! Temos uma novidade para a Acme.')).toBeInTheDocument();
  });

  it('a tela Agendada mostra a mensagem na moldura, e não numa bolha solta', () => {
    render(<TalkXCampaignScheduled campaignId="camp-1" onBack={vi.fn()} onEdit={vi.fn()} onStatusChange={vi.fn()} />);

    expect(screen.getByTestId('talkx-phone-frame')).toBeInTheDocument();
    expect(screen.getByText(/Temos uma novidade para a/)).toBeInTheDocument();
  });
});
