import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * [refazer N-113] Trava da entrega multi-segmentos no wizard de campanha.
 * Prova ponto a ponto o que a recusa cobrou, chamando o código real:
 * 1. o total é a UNIÃO via UMA chamada countAudience(null, segmentIds)
 *    (p_segment_ids com a lista completa) — nunca soma nem estimated_count;
 * 2. a seleção múltipla envia segment_ids (+ segment_id espelhado);
 * 3. campanha antiga só com segment_id abre com segmentIds preenchido;
 * 4. só segmentos ativos aparecem, com busca rotulada e escolhidos removíveis;
 * 5. a revisão mostra o total da união + a contagem por segmento.
 */

type CapturedQuery = {
  queryKey: unknown[];
  queryFn?: (context: { signal: AbortSignal }) => Promise<unknown>;
};

const f = vi.hoisted(() => ({
  create: vi.fn(async (payload: Record<string, unknown>) => ({ id: 'draft_1', ...payload })),
  update: vi.fn(),
  saveDraft: vi.fn(),
  replace: vi.fn(),
  snapshot: vi.fn(),
  start: vi.fn(),
  log: vi.fn(),
  resolveAudience: vi.fn(async () => [] as unknown[]),
  countAudience: vi.fn(async (_rules: unknown, segmentIds?: string[]) => {
    if (segmentIds && segmentIds.length === 2) return 7; // união deduplicada (5+5 com 3 repetidos)
    return 5;
  }),
  fetchVersionHistory: vi.fn(async () => [] as { id: string; version_number: number }[]),
  contacts: [{ id: 'contact-1', name: 'Ana Silva', nickname: null, phone: '5511999999999', company: 'Acme', avatar_url: null, tags: ['VIP'] }],
  connections: [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }],
  persistedRecipientIds: [] as { contact_id: string }[] | undefined,
  templates: [] as { id: string; content: string; media_url: string | null; media_type?: string | null; use_count: number; current_version_id?: string | null }[],
  profile: { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' } as { id: string; name: string; email: string } | null,
  segments: [
    { id: 'seg-a', name: 'Ativos Q3', description: '', status: 'active', estimated_count: 5, rules: { groups: [] } },
    { id: 'seg-b', name: 'VIP', description: '', status: 'active', estimated_count: 5, rules: { groups: [] } },
    { id: 'seg-c', name: 'Antiga', description: '', status: 'archived', estimated_count: 9, rules: { groups: [] } },
  ] as { id: string; name: string; description: string; status: string; estimated_count: number; rules: unknown }[],
  owners: [] as { id: string; name: string | null; email: string | null }[],
  queryCalls: [] as CapturedQuery[],
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [],
    createCampaign: { mutateAsync: f.create },
    updateCampaign: { mutateAsync: f.update },
    saveDraftCampaign: {
      mutateAsync: async (input: { campaignId: string | null; expectedRevision: number | null; creationKey: string | null; payload: Record<string, unknown> }) => {
        const { campaignId, expectedRevision, payload } = input;
        f.saveDraft(input);
        if (campaignId) {
          await f.update({ id: campaignId, ...payload });
          return { campaignId, revision: (expectedRevision ?? 1) + 1, creationReplayed: false };
        }
        const created = await f.create(payload);
        return { campaignId: created.id, revision: 1, creationReplayed: false };
      },
    },
    replaceDraftRecipients: { mutateAsync: f.replace },
    snapshotDraftAudience: { mutateAsync: f.snapshot },
    startCampaign: f.start,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({ segments: f.segments }),
    resolveAudience: f.resolveAudience,
    countAudience: f.countAudience,
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, profile: f.profile, loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), refreshProfile: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: f.templates,
    registerUse: vi.fn(),
    fetchVersionHistory: f.fetchVersionHistory,
    createTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    updateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    duplicateTemplate: { mutateAsync: vi.fn(), mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVariants: vi.fn(async () => []),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(async () => 0),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({ useTalkXEventLogger: () => f.log }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: vi.fn(() => ({
    update: vi.fn(() => ({ in: vi.fn(async () => ({})) })),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null })) })) })),
  })),
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({ useExternalContact360Batch: () => ({ batchData: new Map(), lookup: () => undefined, isLoading: false, isConfigured: false }) }));
vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: unknown[]; queryFn?: CapturedQuery['queryFn'] }) => {
    f.queryCalls.push({ queryKey: options.queryKey ?? [], queryFn: options.queryFn });
    const key = String(options.queryKey?.[0]);
    // União dedupada pelo servidor (p_segment_ids com a lista completa):
    // 5 + 5 com 3 contatos repetidos = 7, NUNCA 10.
    const data = key === 'talkx-wizard-segment-union-total' ? 7
      : key === 'talkx-wizard-segment-counts' ? { 'seg-a': 5, 'seg-b': 5 }
      : key === 'wa-connections-talkx' ? f.connections
      : key === 'talkx-audience-contacts' ? f.contacts
      : key === 'talkx-audience-count' ? f.contacts.length
      : key === 'talkx-owner-profiles' ? f.owners
      : key === 'talkx-draft-recipient-ids' ? f.persistedRecipientIds?.map((recipient) => recipient.contact_id)
      : undefined;
    return { data, isFetching: false };
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() }),
}));

import { useCampaignEditor } from '@/components/talkx/useCampaignEditor';
import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';
import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
});

afterEach(() => {
  vi.clearAllMocks();
  f.queryCalls = [];
});

function unionQuery() {
  const found = [...f.queryCalls].reverse().find((q) => String(q.queryKey[0]) === 'talkx-wizard-segment-union-total');
  return found;
}

describe('Talk X multi-segmentos — união, payload e lista (N-113)', () => {
  it('o total é a união via UMA chamada countAudience(null, ids) — não a soma (5+5=10)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn(), { segmentIds: ['seg-a'] }));
    act(() => { result.current.toggleSegmentId('seg-b'); });

    // A consulta da união existe e chama o RPC UMA vez com a lista completa.
    const union = unionQuery();
    expect(union?.queryFn).toBeDefined();
    f.countAudience.mockClear();
    await act(async () => { await union?.queryFn?.({ signal: new AbortController().signal }); });
    expect(f.countAudience).toHaveBeenCalledTimes(1);
    expect(f.countAudience).toHaveBeenCalledWith(null, ['seg-a', 'seg-b']);

    // O total exibido é a união (7), não a soma das individuais (10).
    expect(result.current.audienceTotal).toBe(7);
  });

  it('a seleção múltipla envia segment_ids e espelha segment_id (contrato com leitores antigos)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn(), { segmentIds: ['seg-a'] }));
    act(() => {
      result.current.setName('Campanha multi');
      result.current.toggleSegmentId('seg-b');
    });

    await act(async () => { await result.current.handleSave('draft'); });

    expect(f.saveDraft).toHaveBeenCalled();
    const payload = f.saveDraft.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.segment_ids).toEqual(['seg-a', 'seg-b']);
    expect(payload.segment_id).toBe('seg-a');
  });

  it('campanha antiga só com segment_id abre com a seleção preenchida', () => {
    const legacy = {
      id: 'c-old', name: 'Antiga', audience_source: 'segment',
      segment_ids: null, segment_id: 'seg-a',
    } as unknown as TalkXCampaign;
    const { result } = renderHook(() => useCampaignEditor(legacy, vi.fn()));
    expect(result.current.segmentIds).toEqual(['seg-a']);
  });

  it('só segmentos ativos aparecem, com busca rotulada e escolhidos removíveis', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} initial={{ segmentIds: ['seg-a'] }} />);

    // Busca com rótulo acessível (label + aria-label).
    expect(screen.getByLabelText('Buscar segmentos por nome')).toBeInTheDocument();
    // Só ativos na lista: o arquivado não aparece (o cartão mostra "Nome (contagem)").
    expect(screen.getByRole('button', { name: /Ativos Q3\(5\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Antiga/ })).not.toBeInTheDocument();
    // Contagem por segmento no cartão.
    expect(screen.getAllByText('(5)').length).toBeGreaterThan(0);

    // Escolhidos com remoção nomeada.
    expect(screen.getByText('Segmentos escolhidos:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Ativos Q3 dos escolhidos' })).toBeInTheDocument();

    // Selecionar o segundo e remover: o chip some dos escolhidos.
    fireEvent.click(screen.getByRole('button', { name: /VIP\(5\)/ }));
    expect(screen.getByRole('button', { name: 'Remover VIP dos escolhidos' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover VIP dos escolhidos' }));
    expect(screen.queryByRole('button', { name: 'Remover VIP dos escolhidos' })).not.toBeInTheDocument();
  });

  it('countAudience real encaminha p_segment_ids à RPC (união decidida no servidor)', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/integrations/useTalkXSegments')>('@/hooks/integrations/useTalkXSegments');
    const { supabase } = await import('@/integrations/supabase/client');
    const rpc = vi.fn(async () => ({ data: { eligible: 7 }, error: null }));
    (supabase as unknown as { rpc: unknown }).rpc = rpc;
    await expect(actual.countAudience(null, ['seg-a', 'seg-b'])).resolves.toBe(7);
    expect(rpc).toHaveBeenCalledWith(
      'talkx_resolve_audience',
      expect.objectContaining({ p_segment_ids: ['seg-a', 'seg-b'], p_mode: 'count' }),
    );
  });

  it('a revisão mostra o total da união e a contagem por segmento', () => {
    const ed = {
      name: 'Campanha multi', description: '', objective: 'sales',
      audienceSource: 'segment',
      selectedSegments: [
        { id: 'seg-a', name: 'Ativos Q3', estimated_count: 5 },
        { id: 'seg-b', name: 'VIP', estimated_count: 5 },
      ],
      segmentEstimates: { 'seg-a': 5, 'seg-b': 5 },
      selectedContacts: [], audienceTotal: 7, eligibleCount: 7,
      respectSuppression: true, suppressedCount: 0,
      selectedTemplate: null, messageTemplate: 'Oi',
      speedProfile: 'moderate', messagesPerMinute: 20, estimatedTime: '5 min',
      isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
      sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00',
      businessHoursOnly: false, confirmConsent: true, confirmContent: true, confirmSuppression: true,
      canProceed: { 1: true, 2: true, 3: true, 4: true },
      saving: false, hasMedia: false, mediaUrl: '', mediaType: null,
      connectionId: 'c1', connections: [{ id: 'c1', name: 'Linha', phone_number: '5511999999999' }],
      contacts: [],
      handleSave: vi.fn().mockResolvedValue('draft_1'),
    } as unknown as WizardState;

    render(<TalkXWizardReview ed={ed} campaign={null} onLaunched={vi.fn()} />);
    expect(screen.getByText(/7 contatos na união/)).toBeInTheDocument();
    expect(screen.getByText(/Ativos Q3 \(5\).*VIP \(5\)/)).toBeInTheDocument();
  });
});
