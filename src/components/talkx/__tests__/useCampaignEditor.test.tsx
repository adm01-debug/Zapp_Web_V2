import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Consulta registrada pelo mock de `useQuery` (o teste invoca o `queryFn`). */
type CapturedQuery = {
  queryKey: unknown[];
  queryFn?: (context: { signal: AbortSignal }) => Promise<unknown>;
};

const f = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saveDraft: vi.fn(), replace: vi.fn(), snapshot: vi.fn(), start: vi.fn(), log: vi.fn(),
  resolveAudience: vi.fn(async (_rules: unknown, _limit?: number) => [] as unknown[]),
  countAudience: vi.fn(async (_rules: unknown) => 0),
  // Histórico de versões: consumido pelo TalkXTemplateEditor (renderizado nesta
  // suíte). O wizard NÃO o usa: resolve a versão por current_version_id.
  fetchVersionHistory: vi.fn(async (_templateId: string) => [] as { id: string; version_number: number }[]),
  contacts: [{ id: 'contact-1', name: 'Ana Silva', nickname: null, phone: '5511999999999', company: 'Acme', avatar_url: null, tags: ['VIP'] }],
  connections: [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }],
  persistedRecipientIds: [] as { contact_id: string }[] | undefined,
  templates: [] as { id: string; content: string; media_url: string | null; media_type?: string | null; use_count: number; current_version_id?: string | null }[],
  // V25 — usuário logado (profiles.id) e segmentos do passo 1.
  profile: { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' } as { id: string; name: string; email: string } | null,
  segments: [] as { id: string; name: string; description: string; status: string; estimated_count: number }[],
  queryCalls: [] as CapturedQuery[],
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
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
    // X017 — geração do snapshot no servidor (editor não chama mais replace).
    snapshotDraftAudience: { mutateAsync: f.snapshot },
    startCampaign: f.start,
  }),
}));
// V24 — o motor de segmentos entra REAL (RULE_FIELDS/RULE_OPS/rulesToPostgrest/
// emptyRules); só as consultas ao banco viram spies, para o teste provar que a
// regra marcada no passo 1 chega ao motor.
vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({ segments: f.segments }),
    resolveAudience: f.resolveAudience,
    countAudience: f.countAudience,
  };
});
// V25 — `useCampaignEditor` usa `useAuth().profile.id` como responsável padrão.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, profile: f.profile, loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: f.templates,
    registerUse: vi.fn(),
    // O editor de template (também renderizado nesta suíte) consome o histórico.
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
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({ useExternalContact360Batch: () => ({ batchData: new Map(), lookup: () => undefined, isLoading: false, isConfigured: false }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: unknown[]; queryFn?: CapturedQuery['queryFn'] }) => {
    f.queryCalls.push({ queryKey: options.queryKey ?? [], queryFn: options.queryFn });
    const key = String(options.queryKey?.[0]);
    const data = key === 'wa-connections-talkx' ? f.connections
      : key === 'talkx-audience-contacts' ? f.contacts
        : key === 'talkx-audience-count' ? f.contacts.length
          : key === 'talkx-draft-recipient-ids' ? f.persistedRecipientIds?.map((recipient) => recipient.contact_id)
            : undefined;
    return { data, isFetching: false };
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() }),
}));

import { AUDIENCE_PREVIEW_LIMIT, localToUTCInTimezone, useCampaignEditor } from '@/components/talkx/useCampaignEditor';
import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';
import { TalkXTemplateEditor } from '@/components/talkx/TalkXTemplateEditor';
import { OBJECTIVES, personalizePreview } from '@/components/talkx/talkxShared';
import { rulesToPostgrest, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';
// X017 — spy do cliente Supabase: prova que o persist não faz consulta solta.
import { supabase } from '@/integrations/supabase/client';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Última consulta registrada com a chave informada (o mock empilha por render). */
function capturedQuery(key: string): CapturedQuery | undefined {
  return [...f.queryCalls].reverse().find((entry) => String(entry.queryKey[0]) === key);
}

/** Valor do filtro PostgREST persistido no último save. */
function lastSavedFilter(): string | null {
  const calls = f.update.mock.calls;
  const payload = calls[calls.length - 1]?.[0] as { audience_filters?: SegmentRules } | undefined;
  return rulesToPostgrest(payload?.audience_filters);
}

describe('useCampaignEditor — draft integrity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.saveDraft.mockClear();
    f.replace.mockResolvedValue(1);
    f.snapshot.mockResolvedValue({ eligible: 1, suppressed: 0, skipped_invalid: 0 });
    f.start.mockResolvedValue(true);
    f.log.mockResolvedValue({});
    f.persistedRecipientIds = [];
    f.templates = [];
    f.profile = { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' };
    f.segments = [];
    f.connections = [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }];
    f.queryCalls.length = 0;
    f.resolveAudience.mockResolvedValue(f.contacts);
    f.countAudience.mockResolvedValue(f.contacts.length);
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it('rejects a nonexistent local DST time instead of silently moving the scheduled instant', () => {
    expect(() => localToUTCInTimezone('2026-03-08T02:30', 'America/New_York'))
      .toThrow('horário selecionado não existe');
  });

  it('converts a valid time after the DST transition using the offset in effect at that time', () => {
    expect(localToUTCInTimezone('2026-03-08T03:30', 'America/New_York'))
      .toBe('2026-03-08T07:30:00.000Z');
  });

  it('rejects an ambiguous local DST time instead of arbitrarily choosing one occurrence', () => {
    expect(() => localToUTCInTimezone('2026-11-01T01:30', 'America/New_York'))
      .toThrow('horário selecionado é ambíguo');
  });

  it('uses the requested valid wizard step and rejects an invalid value', () => {
    window.history.replaceState(null, '', '/?view=talkx&wizard=new&step=3');
    const { result, unmount } = renderHook(() => useCampaignEditor(null, vi.fn()));
    expect(result.current.step).toBe(3);
    unmount();

    window.history.replaceState(null, '', '/?step=99');
    const invalid = renderHook(() => useCampaignEditor(null, vi.fn()));
    expect(invalid.result.current.step).toBe(1);
  });

  it('uses a real disabled control while the current step is invalid', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  it('oferece os filtros do passo 1 pelo catálogo de regras e consulta o motor (V24)', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    // X126: a trilha "Filtros de audiência" passou a ser o componente dos 7
    // controles do mock (antes, o editor genérico de regras com "Adicionar
    // filtro"). O que o caso protege continua igual: os filtros vêm do catálogo
    // de regras e a lista/contagem saem do motor.
    expect(screen.getByRole('group', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Localização' })).toBeInTheDocument();
    // A lista e a contagem do passo 1 saem do motor (não mais do SELECT morto).
    expect(capturedQuery('talkx-audience-contacts')).toBeDefined();
    expect(capturedQuery('talkx-audience-count')).toBeDefined();
  });

  it('does not offer a stale or instance-less WhatsApp connection for campaign delivery', () => {
    f.connections = [
      { id: 'offline', name: 'Offline', status: 'disconnected', instance_id: 'evolution-offline' },
      { id: 'blank', name: 'Sem instância', status: 'connected', instance_id: '   ' },
    ];
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));

    expect(result.current.connections).toEqual([]);
    expect(result.current.connectionId).toBe('');
    expect(result.current.canProceed[1]).toBe(false);
  });

  it('creates one draft and asks the server for the audience snapshot on later saves (X017)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => { result.current.setName('Campanha de teste'); result.current.toggleContact('contact-1'); });

    await act(async () => { await result.current.handleSave('draft'); });
    await act(async () => { await result.current.handleSave('draft'); });

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1' }));
    expect(f.snapshot).toHaveBeenCalledTimes(2);
    expect(f.snapshot).toHaveBeenLastCalledWith({ campaignId: 'draft-1', expectedRevision: 2 });
    // X017: a substituição de destinatários no navegador saiu de cena.
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('persist resolves the audience on the server: no talkx_blacklist query and no .in("id", …) (X017)', async () => {
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    fromSpy.mockClear();
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => { result.current.setName('Campanha de teste'); result.current.toggleContact('contact-1'); });

    await act(async () => { await result.current.handleSave('draft'); });

    // Nenhuma leitura de blacklist e nenhuma consulta PostgREST solta no persist.
    expect(fromSpy.mock.calls.map(([table]) => table)).not.toContain('talkx_blacklist');
    expect(fromSpy).not.toHaveBeenCalled();
    // A geração de destinatários virou UMA chamada de RPC com a revisão corrente.
    expect(f.snapshot).toHaveBeenCalledWith({ campaignId: 'draft-1', expectedRevision: 1 });
  });

  it('uses the created identity after opening a duplicate with an empty id', async () => {
    const duplicate = { id: '', name: 'Cópia', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(duplicate as never, vi.fn()));

    await act(async () => { await result.current.handleSave('draft'); });
    await act(async () => { await result.current.handleSave('draft'); });

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'draft-1' }));
  });

  it('reuses the tab-scoped creation key after a create response is lost', async () => {
    f.create.mockRejectedValueOnce(new Error('network_response_lost'));
    const first = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => first.result.current.setName('Campanha recuperável'));

    await expect(first.result.current.handleSave('draft')).rejects.toThrow('network_response_lost');
    const firstKey = f.saveDraft.mock.calls[0]?.[0]?.creationKey;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    first.unmount();

    const recovered = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => recovered.result.current.setName('Campanha recuperável'));
    await act(async () => { await recovered.result.current.handleSave('draft'); });

    expect(f.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      campaignId: null,
      creationKey: firstKey,
    }));
  });

  it('sends an optimistic revision and advances it only after the database confirms the save', async () => {
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft', revision: 7 };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));

    await act(async () => { await result.current.handleSave('draft'); });
    expect(f.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      campaignId: 'draft-1', expectedRevision: 7, creationKey: null,
    }));

    await act(async () => { await result.current.handleSave('draft'); });
    expect(f.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      campaignId: 'draft-1', expectedRevision: 8, creationKey: null,
    }));
    expect(result.current.draftRevision).toBe(9);
  });

  it('restores the persisted recipient snapshot before editing an existing draft', async () => {
    f.persistedRecipientIds = [{ contact_id: 'contact-1' }];
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    expect(result.current.selectedContacts).toEqual(['contact-1']);
  });

  it('hidrata TODOS os destinatários do rascunho, além da primeira página do PostgREST (#103)', async () => {
    // O PostgREST devolve no máximo 1000 linhas por resposta: o mock reproduz
    // esse teto — sem `.range()` só a primeira página volta; com `.range()` a
    // fatia pedida. O dataset tem 2500 destinatários (3 páginas).
    const PAGE_CAP = 1000;
    const TOTAL = 2500;
    const recipients = Array.from({ length: TOTAL }, (_, i) => ({ id: `recipient-${i}`, contact_id: `contato-${i}` }));
    const rangeCalls: [number, number][] = [];
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    fromSpy.mockImplementation((table: string) => {
      if (table !== 'talkx_recipients') throw new Error(`tabela inesperada: ${table}`);
      let from: number | null = null;
      let to: number | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: (f2: number, t: number) => { from = f2; to = t; rangeCalls.push([f2, t]); return q; },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({
          data: from === null ? recipients.slice(0, PAGE_CAP) : recipients.slice(from, (to ?? 0) + 1),
          error: null,
        })),
      };
      return q;
    });
    try {
      const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
      renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
      const queryFn = capturedQuery('talkx-draft-recipient-ids')?.queryFn;
      if (!queryFn) throw new Error('a consulta de destinatários precisa expor queryFn');

      const ids = (await queryFn({ signal: new AbortController().signal })) as string[];

      expect(rangeCalls.length).toBeGreaterThan(1);
      expect(ids).toHaveLength(TOTAL);
      expect(new Set(ids).size).toBe(TOTAL);
    } finally {
      fromSpy.mockReset();
    }
  });

  it('a hidratação da audiência não é edição: sem ação do usuário nada é gravado, e renomear preserva todos os contatos (#103)', async () => {
    // Audiência maior que o teto do PostgREST (1500 > 1000): a hidratação não
    // pode disparar autosave nem fazer a gravação levar só a primeira página.
    const TOTAL = 1500;
    const persistedIds = Array.from({ length: TOTAL }, (_, i) => ({ contact_id: `contato-${i}` }));
    f.persistedRecipientIds = persistedIds;
    const campaign = {
      id: 'draft-1', name: 'Rascunho', status: 'draft',
      owner: 'profile-1', whatsapp_connection_id: 'connection-1',
    };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    expect(result.current.selectedContacts).toHaveLength(TOTAL);

    // Hidratação não é edição do usuário: sem nenhuma ação, nada pode ser gravado.
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(f.saveDraft).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();

    // Edição apenas de nome: o autosave grava com a audiência hidratada INTEIRA.
    act(() => result.current.setName('Rascunho renomeado'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-1',
      audience_filters: expect.objectContaining({
        contact_ids: persistedIds.map((recipient) => recipient.contact_id),
      }),
    }));
  });

  it('mudança intencional de público continua gerando payload com a NOVA audiência (#103)', async () => {
    f.persistedRecipientIds = [{ contact_id: 'contato-1' }, { contact_id: 'contato-2' }];
    const campaign = {
      id: 'draft-1', name: 'Rascunho', status: 'draft',
      owner: 'profile-1', whatsapp_connection_id: 'connection-1',
    };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    expect(result.current.selectedContacts).toEqual(['contato-1', 'contato-2']);

    act(() => result.current.toggleContact('contato-2'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    const calls = f.update.mock.calls;
    const payload = calls[calls.length - 1]?.[0] as { audience_filters?: { contact_ids?: string[] } } | undefined;
    expect(payload?.audience_filters?.contact_ids).toEqual(['contato-1']);
  });

  it('autosaves a changed manual selection against the existing draft identity', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setName('Campanha de teste'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    act(() => result.current.toggleContact('contact-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.snapshot).toHaveBeenLastCalledWith({ campaignId: 'draft-1', expectedRevision: 2 });
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('persiste as regras de audiência no mesmo JSON do motor (V24)', async () => {
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    f.update.mockClear();

    act(() => result.current.setCompanyFilter('Acme'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(lastSavedFilter()).toBe('company.eq."Acme"');

    f.update.mockClear();
    act(() => result.current.setCompanyFilter('all'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(lastSavedFilter()).toBeNull();
  });

  it('converte o snapshot solto do V23 em regras e descarta os filtros mortos (V24)', async () => {
    const campaign = {
      id: 'draft-1', name: 'Rascunho', status: 'draft', audience_source: 'contacts',
      audience_filters: { company: 'Acme', tag: 'VIP', city: 'Recife', state: 'PE', status: 'open', group: 'Grupo A', inactive: true, birthday: 'this_month', search: 'ana' },
    };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});

    expect(rulesToPostgrest(result.current.audienceRules))
      .toBe('and(company.eq."Acme",tags.cs.{"VIP"},city.eq."Recife",state.eq."PE",conversation_status.eq."open")');
    expect(result.current.companyFilter).toBe('Acme');
    expect(result.current.tagFilter).toBe('VIP');
    expect(result.current.contactSearch).toBe('ana');
    // group/inactive/birthday eram filtros mortos: não são convertidos nem expostos.
    expect(result.current).not.toHaveProperty('cityFilter');
    expect(result.current).not.toHaveProperty('groupFilter');
    expect(result.current).not.toHaveProperty('inactiveFilter');
    expect(result.current).not.toHaveProperty('birthdayFilter');
  });

  it('o rascunho salvo com regras reabre com as mesmas regras (V24)', async () => {
    const first = renderHook(() => useCampaignEditor({ id: 'draft-1', name: 'Rascunho', status: 'draft', audience_source: 'contacts' } as never, vi.fn()));
    await act(async () => {});
    act(() => { first.result.current.setCompanyFilter('Acme'); first.result.current.setTagFilter('VIP'); });
    act(() => first.result.current.addAudienceRule('city'));
    const cityRule = first.result.current.audienceRules.groups[0].rules.find((rule) => rule.field === 'city');
    if (!cityRule) throw new Error('a regra de cidade deveria existir');
    act(() => { first.result.current.updateAudienceRule(cityRule.id, { op: 'eq', value: 'Recife' }); first.result.current.setContactSearch('ana'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    const calls = f.update.mock.calls;
    const saved = calls[calls.length - 1]?.[0] as { audience_filters?: SegmentRules } | undefined;
    const savedFilter = rulesToPostgrest(saved?.audience_filters) ?? '';
    expect(savedFilter).toContain('company.eq."Acme"');
    expect(savedFilter).toContain('tags.cs.{"VIP"}');
    expect(savedFilter).toContain('city.eq."Recife"');
    first.unmount();

    const second = renderHook(() => useCampaignEditor({
      id: 'draft-1', name: 'Rascunho', status: 'draft', audience_source: 'contacts',
      audience_filters: saved?.audience_filters,
    } as never, vi.fn()));
    await act(async () => {});

    expect(second.result.current.audienceRules).toEqual({ groups: saved?.audience_filters?.groups });
    expect(second.result.current.companyFilter).toBe('Acme');
    expect(second.result.current.tagFilter).toBe('VIP');
    expect(second.result.current.contactSearch).toBe('ana');
  });

  it('marcar um filtro de cidade consulta o motor com a regra correspondente (V24)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});

    act(() => result.current.addAudienceRule('city'));
    const ruleId = result.current.audienceRules.groups[0].rules[0]?.id;
    if (!ruleId) throw new Error('a regra de cidade deveria existir');
    act(() => result.current.updateAudienceRule(ruleId, { op: 'eq', value: 'Sao Paulo' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    const listQuery = capturedQuery('talkx-audience-contacts');
    const countQuery = capturedQuery('talkx-audience-count');
    // A chave da consulta carrega a regra: é ela que dispara a nova busca.
    expect(String(listQuery?.queryKey[1])).toContain('"field":"city"');
    expect(String(listQuery?.queryKey[1])).toContain('"value":"Sao Paulo"');
    expect(String(countQuery?.queryKey[1])).toBe(String(listQuery?.queryKey[1]));

    const listFn = listQuery?.queryFn;
    const countFn = countQuery?.queryFn;
    if (!listFn || !countFn) throw new Error('as consultas de audiência precisam expor queryFn');

    // Sem a regra na consulta este teste falha: ela tem de chegar ao motor.
    const signal = new AbortController().signal;
    f.resolveAudience.mockClear();
    f.countAudience.mockClear();
    await listFn({ signal });
    await countFn({ signal });

    expect(f.resolveAudience).toHaveBeenCalledTimes(1);
    expect(f.countAudience).toHaveBeenCalledTimes(1);
    expect(f.resolveAudience).toHaveBeenCalledWith(expect.anything(), AUDIENCE_PREVIEW_LIMIT);
    expect(rulesToPostgrest(f.resolveAudience.mock.calls[0][0] as SegmentRules)).toBe('city.eq."Sao Paulo"');
    expect(rulesToPostgrest(f.countAudience.mock.calls[0][0] as SegmentRules)).toBe('city.eq."Sao Paulo"');
  });

  it('descarta a resposta de uma consulta de audiência já cancelada (V24)', async () => {
    renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    const listFn = capturedQuery('talkx-audience-contacts')?.queryFn;
    if (!listFn) throw new Error('a consulta de audiência precisa expor queryFn');

    const controller = new AbortController();
    controller.abort();
    await expect(listFn({ signal: controller.signal })).rejects.toThrow('cancelada');
  });

  it('não expõe nem persiste os filtros mortos group/inactive/birthday (V24)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});

    for (const dead of ['cityFilter', 'setCityFilter', 'groupFilter', 'setGroupFilter', 'inactiveFilter', 'setInactiveFilter', 'birthdayFilter', 'setBirthdayFilter']) {
      expect(result.current).not.toHaveProperty(dead);
    }

    act(() => { result.current.setName('Campanha sem filtros mortos'); result.current.toggleContact('contact-1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    const payload = f.create.mock.calls[f.create.mock.calls.length - 1]?.[0] as { audience_filters?: Record<string, unknown> } | undefined;
    const filters = payload?.audience_filters ?? {};
    expect(Array.isArray(filters.groups)).toBe(true);
    for (const dead of ['company', 'tag', 'city', 'state', 'status', 'group', 'inactive', 'birthday']) {
      expect(filters).not.toHaveProperty(dead);
    }
  });

  it('persiste o passo do wizard no payload do rascunho (V23)', async () => {
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    f.update.mockClear();

    act(() => result.current.setStep(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', draft_step: 2 }));
  });

  it('round-trip: sair no passo 2 com regra e reabrir no mesmo passo com a mesma regra (V23/V24)', async () => {
    const first = renderHook(() => useCampaignEditor({ id: 'draft-1', name: 'Rascunho', status: 'draft', audience_source: 'contacts' } as never, vi.fn()));
    await act(async () => {});
    act(() => { first.result.current.setStep(2); first.result.current.addAudienceRule('city'); });
    const cityRule = first.result.current.audienceRules.groups[0].rules[0];
    if (!cityRule) throw new Error('a regra de cidade deveria existir');
    act(() => first.result.current.updateAudienceRule(cityRule.id, { op: 'eq', value: 'Recife' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    const calls = f.update.mock.calls;
    const saved = calls[calls.length - 1]?.[0] as { draft_step?: number; audience_filters?: SegmentRules };
    first.unmount();

    const second = renderHook(() => useCampaignEditor({
      id: 'draft-1', name: 'Rascunho', status: 'draft', audience_source: 'contacts',
      draft_step: saved.draft_step, audience_filters: saved.audience_filters,
    } as never, vi.fn()));
    await act(async () => {});

    expect(saved.draft_step).toBe(2);
    expect(second.result.current.step).toBe(2);
    expect(rulesToPostgrest(second.result.current.audienceRules)).toBe('city.eq."Recife"');
  });

  it('reports a failed autosave and only marks the latest snapshot saved after a confirmed retry', async () => {
    f.create.mockRejectedValueOnce(new Error('rede indisponível')).mockResolvedValueOnce({ id: 'draft-recovered' });
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setName('Campanha com recuperação'));

    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(result.current.autosaveStatus).toBe('error');
    expect(result.current.autosaveError).toBe('rede indisponível');
    expect(result.current.lastAutosave).toBeNull();

    await act(async () => { await result.current.retryAutosave(); });
    expect(result.current.autosaveStatus).toBe('idle');
    expect(result.current.autosaveError).toBeNull();
    expect(result.current.lastAutosave).toBeInstanceOf(Date);
    expect(result.current.autosaveIsDirty).toBe(false);
  });

  it('does not overwrite an existing audience before its snapshot hydrates', async () => {
    f.persistedRecipientIds = undefined;
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));

    await act(async () => {
      await expect(result.current.handleSave('draft')).rejects.toThrow('audiência deste rascunho ainda está carregando');
    });
    expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('serializes overlapping saves and reuses the ID created by the first request', async () => {
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    f.create.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setName('Primeira versão'));

    const first = result.current.handleSave('draft');
    await act(async () => {});
    act(() => result.current.setName('Versão mais recente'));
    const second = result.current.handleSave('draft');

    await act(async () => { resolveCreate?.({ id: 'draft-1' }); await first; await second; });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', name: 'Versão mais recente' }));
  });

  it('keeps processing queued saves after an earlier save fails', async () => {
    f.create.mockRejectedValueOnce(new Error('Falha transitória')).mockResolvedValueOnce({ id: 'draft-2' });
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setName('Campanha resiliente'));

    const first = result.current.handleSave('draft');
    const second = result.current.handleSave('draft');

    await act(async () => {
      await expect(first).rejects.toThrow('Falha transitória');
      await expect(second).resolves.toBe('draft-2');
    });
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it('limpa a busca textual e as regras no "Limpar filtros" (V24)', () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.addAudienceRule('city'));
    const cityRule = result.current.audienceRules.groups[0].rules[0];
    if (!cityRule) throw new Error('a regra de cidade deveria existir');
    act(() => { result.current.updateAudienceRule(cityRule.id, { value: 'Recife' }); result.current.setContactSearch('ausente'); });
    expect(rulesToPostgrest(result.current.audienceRules)).toBe('city.eq."Recife"');

    act(() => result.current.clearFilters());

    expect(result.current.contactSearch).toBe('');
    expect(rulesToPostgrest(result.current.audienceRules)).toBeNull();
    expect(result.current.filteredContacts).toHaveLength(1);
  });

  it('round-trips a scheduled instant when the displayed timezone changes', async () => {
    const campaign = { id: 'scheduled-1', name: 'Agendada', status: 'scheduled', scheduled_at: '2026-09-15T12:00:00.000Z' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    expect(result.current.scheduledAt).toBe('2026-09-15T09:00');
    act(() => result.current.setScheduleTimezone('America/New_York'));
    expect(result.current.scheduledAt).toBe('2026-09-15T08:00');

    await act(async () => { await result.current.handleSave('draft'); });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ scheduled_at: '2026-09-15T12:00:00.000Z' }));
  });

  it('restores and persists the campaign IANA timezone instead of the browser timezone', async () => {
    const campaign = {
      id: 'scheduled-ny-1', name: 'Nova York', status: 'scheduled',
      scheduled_at: '2026-09-15T12:00:00.000Z', schedule_timezone: 'America/New_York',
    };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    expect(result.current.scheduleTimezone).toBe('America/New_York');
    expect(result.current.scheduledAt).toBe('2026-09-15T08:00');

    await act(async () => { await result.current.handleSave('draft'); });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      schedule_timezone: 'America/New_York',
      scheduled_at: '2026-09-15T12:00:00.000Z',
    }));
  });

  it('blocks an inverted send window before a scheduled campaign can advance', () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => {
      result.current.toggleSchedule(true);
      result.current.setScheduledAt('2026-12-01T10:00');
      result.current.setSendWindowEnabled(true);
      result.current.setSendWindowStart('18:00');
      result.current.setSendWindowEnd('08:00');
    });
    expect(result.current.canProceed[3]).toBe(false);
  });

  it('não grava evento de ciclo de vida no cliente (X025)', async () => {
    // X025: created/updated saem do trigger do servidor e started da transição;
    // o cliente não escreve mais nenhum evento de ciclo de vida — nem o falso
    // 'started' quando o pedido de envio é recusado.
    f.start.mockResolvedValue(false);
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => {
      result.current.setName('Campanha de teste');
      result.current.toggleContact('contact-1');
      result.current.setMessageTemplate('Olá {{nome}}');
      result.current.setConfirmConsent(true);
      result.current.setConfirmContent(true);
      result.current.setConfirmSuppression(true);
    });

    await act(async () => {
      await expect(result.current.handleSave('launch')).rejects.toThrow('A campanha não foi iniciada');
    });
    expect(f.start).toHaveBeenCalledWith('draft-1');
    // Nenhum logEvent de ciclo de vida parte do editor.
    expect(f.log).not.toHaveBeenCalled();
  });

  it('resolves launch as soon as the async start is accepted, without waiting for the send', async () => {
    // X013: o hook (useTalkX) devolve true quando a edge responde
    // `{ accepted: true, status: 'sending' }` — o lote roda em outra invocação.
    // O wizard não pode bloquear esperando o envio terminar.
    f.start.mockResolvedValue(true);
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => {
      result.current.setName('Campanha de teste');
      result.current.toggleContact('contact-1');
      result.current.setMessageTemplate('Olá {{nome}}');
      result.current.setConfirmConsent(true);
      result.current.setConfirmContent(true);
      result.current.setConfirmSuppression(true);
    });

    let launchedId: string | null = null;
    await act(async () => {
      launchedId = await result.current.handleSave('launch');
    });
    expect(launchedId).toBe('draft-1');
    expect(f.start).toHaveBeenCalledWith('draft-1');
  });

  it('rejects direct launch when required review confirmations or content are missing', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => {
      result.current.setName('Campanha de teste');
      result.current.toggleContact('contact-1');
    });

    await act(async () => {
      await expect(result.current.handleSave('launch')).rejects.toThrow('Revise público, mensagem, agendamento e confirmações');
    });
    expect(f.start).not.toHaveBeenCalled();
  });

  it('clears existing media when applying a text-only template', () => {
    f.templates = [{ id: 'text-only', content: 'Apenas texto', media_url: null, use_count: 0 }];
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft', media_url: 'old-image.png', media_type: 'image' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));

    act(() => result.current.applyTemplate('text-only'));

    expect(result.current.messageTemplate).toBe('Apenas texto');
    expect(result.current.hasMedia).toBe(false);
    expect(result.current.mediaUrl).toBe('');
  });
});

describe('useCampaignEditor — V25 (responsável, nome mínimo, segmentos ativos, objetivo)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.replace.mockResolvedValue(1);
    f.snapshot.mockResolvedValue({ eligible: 1, suppressed: 0, skipped_invalid: 0 });
    f.start.mockResolvedValue(true);
    f.log.mockResolvedValue({});
    f.persistedRecipientIds = [];
    f.templates = [];
    f.profile = { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' };
    f.segments = [];
    f.connections = [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }];
    f.queryCalls.length = 0;
    f.resolveAudience.mockResolvedValue(f.contacts);
    f.countAudience.mockResolvedValue(f.contacts.length);
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it('exige nome com 3+ caracteres para liberar o passo 1', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});
    // Público e conexão válidos: só o nome separa o bloqueio da liberação.
    act(() => { result.current.setName('abc'); result.current.toggleContact('contact-1'); });
    expect(result.current.canProceed[1]).toBe(true);

    act(() => result.current.setName('a'));
    expect(result.current.canProceed[1]).toBe(false);

    act(() => result.current.setName('ab'));
    expect(result.current.canProceed[1]).toBe(false);

    act(() => result.current.setName('abcd'));
    expect(result.current.canProceed[1]).toBe(true);
  });

  it('mostra o aviso de nome curto apenas com 1–2 caracteres', () => {
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Lançamento Linha Office/i);

    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByText(/O nome precisa de pelo menos 3 caracteres/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.queryByText(/pelo menos 3 caracteres/i)).not.toBeInTheDocument();
  });

  it('assume o usuário logado como responsável padrão e grava owner no payload', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});
    expect(result.current.owner).toBe('profile-1');

    act(() => {
      result.current.setOwner('profile-2');
      result.current.setName('Campanha com responsável');
      result.current.toggleContact('contact-1');
    });
    await act(async () => { await result.current.handleSave('draft'); });

    expect(f.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ owner: 'profile-2' }),
    }));
  });

  it('hidrata o responsável do rascunho em vez do usuário logado', async () => {
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft', owner: 'profile-9' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});

    expect(result.current.owner).toBe('profile-9');
  });

  it('oferece apenas segmentos ativos no passo 1', () => {
    f.segments = [
      { id: 'seg-active', name: 'Segmento Ativo', description: '', status: 'active', estimated_count: 10 },
      { id: 'seg-inactive', name: 'Segmento Inativo', description: '', status: 'inactive', estimated_count: 5 },
    ];
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Segmento salvo/i }));

    expect(screen.getByText('Segmento Ativo')).toBeInTheDocument();
    expect(screen.queryByText('Segmento Inativo')).not.toBeInTheDocument();
  });

  it('desabilita "Segmento salvo" quando só há segmentos inativos (lista filtrada)', () => {
    f.segments = [{ id: 'seg-inactive', name: 'Segmento Inativo', description: '', status: 'inactive', estimated_count: 5 }];
    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    const card = screen.getByRole('button', { name: /Segmento salvo/i });
    expect(card).toBeDisabled();
    expect(card).toHaveTextContent('Nenhum segmento salvo');
  });

  it('todo objetivo tem ícone', () => {
    expect(OBJECTIVES).toHaveLength(6);
    for (const objective of OBJECTIVES) expect(objective.icon).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* V26 — editor de mensagem, só-mídia e versão do template            */
/* ------------------------------------------------------------------ */

/** Template completo (o editor de template lê todos os campos). */
function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1', name: 'Boas-vindas', description: null, category: 'geral',
    content: 'Olá {{nome}} da {{empresa}}', media_url: null, media_type: null,
    tags: [] as string[], status: 'approved' as const, use_count: 0,
    created_by: null, custom_variables: [] as string[],
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('useCampaignEditor — V26 (editor de mensagem, só-mídia e versão do template)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.replace.mockResolvedValue(1);
    f.snapshot.mockResolvedValue({ eligible: 1, suppressed: 0, skipped_invalid: 0 });
    f.start.mockResolvedValue(true);
    f.log.mockResolvedValue({});
    f.persistedRecipientIds = [];
    f.templates = [];
    f.profile = { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' };
    f.segments = [];
    f.connections = [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }];
    f.queryCalls.length = 0;
    f.resolveAudience.mockResolvedValue(f.contacts);
    f.countAudience.mockResolvedValue(f.contacts.length);
    // clearAllMocks não remove implementações: zera explicitamente entre testes.
    f.fetchVersionHistory.mockResolvedValue([]);
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it('usa o TalkXMessageEditor no passo 2 do wizard (toolbar e contador por limite)', () => {
    window.history.replaceState(null, '', '/?view=talkx&wizard=new&step=2');
    // O painel de variáveis do passo 2 usa Tooltip (provider fica no app root).
    render(<TooltipProvider><TalkXCampaignWizard campaign={null} onClose={vi.fn()} /></TooltipProvider>);

    expect(screen.getByTitle('Negrito (*texto*)')).toBeInTheDocument();
    expect(screen.getByTitle('Itálico (_texto_)')).toBeInTheDocument();
    expect(screen.getByTitle('Lista (- item)')).toBeInTheDocument();
    expect(screen.getByTitle('Emoji')).toBeInTheDocument();
    expect(screen.getByTitle('Link (https://)')).toBeInTheDocument();
    expect(screen.getByTitle('Inserir variável')).toBeInTheDocument();
    expect(screen.getByText('0/4096')).toBeInTheDocument();
  });

  it('texto vazio + mídia passa do passo 2; sem mídia não passa', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});

    act(() => { result.current.setMessageTemplate(''); });
    expect(result.current.canProceed[2]).toBe(false);

    act(() => {
      result.current.toggleMedia(true);
      result.current.setMediaType('image');
      result.current.setMediaUrl('https://exemplo.com/foto.jpg');
    });
    expect(result.current.canProceed[2]).toBe(true);
  });

  it('tipo de mídia sem URL não libera o passo 2 (a RPC exige media_url e media_type juntos)', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});

    act(() => {
      result.current.setMessageTemplate('');
      result.current.toggleMedia(true);
      result.current.setMediaType('image');
    });
    expect(result.current.canProceed[2]).toBe(false);
  });

  it('mensagem só com texto continua liberando o passo 2', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    await act(async () => {});
    act(() => result.current.setMessageTemplate('Olá {{nome}}'));
    expect(result.current.canProceed[2]).toBe(true);
  });

  it('aplicar um template grava a versão do conteúdo VIVO (current_version_id), não o histórico', async () => {
    // A coluna talkx_templates.current_version_id aponta para a versão do conteúdo
    // vivo; o histórico devolve uma versão DIFERENTE (version-9 / número 9). O
    // payload tem que levar a COLUNA — se a origem fosse o max(version_number) do
    // histórico, o valor gravado seria version-9 e este teste falharia.
    f.templates = [{ id: 't-1', content: 'Olá {{nome}}', media_url: null, use_count: 0, current_version_id: 'version-current' }];
    f.fetchVersionHistory.mockResolvedValue([{ id: 'version-9', version_number: 9 }]);
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    f.update.mockClear();

    await act(async () => { result.current.applyTemplate('t-1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(result.current.templateVersionId).toBe('version-current');
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', template_version_id: 'version-current' }));
    // A origem correta é a coluna; o caminho de aplicação nem consulta o histórico.
    expect(f.fetchVersionHistory).not.toHaveBeenCalled();
  });

  it('template sem versão corrente (current_version_id nulo/ausente) grava template_version_id nulo', async () => {
    // Sem ponteiro de versão corrente não há versão correta a gravar: o campo
    // continua nulo (não se inventa uma versão a partir do histórico).
    f.templates = [{ id: 't-1', content: 'Olá {{nome}}', media_url: null, use_count: 0, current_version_id: null }];
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    f.update.mockClear();

    await act(async () => { result.current.applyTemplate('t-1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(result.current.templateVersionId).toBeNull();
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', template_version_id: null }));
  });

  it('abrir o wizard com um template inicial resolve a versão pelo current_version_id', async () => {
    f.templates = [{ id: 't-1', content: 'Olá {{nome}}', media_url: null, use_count: 0, current_version_id: 'version-current' }];
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn(), { templateId: 't-1' }));
    await act(async () => {});

    expect(result.current.messageTemplate).toBe('Olá {{nome}}');
    expect(result.current.templateVersionId).toBe('version-current');
  });

  it('mesma entrada produz a mesma prévia no wizard e no editor de template', () => {
    const MSG = 'Olá {{nome}} da {{empresa}}';
    const contact = { id: 'contact-1', name: 'João Silva', nickname: null, company: 'Sua Empresa', phone: '5511999999999', avatar_url: null, tags: [] };
    f.contacts = [contact];
    const template = makeTemplate({ content: MSG });
    f.templates = [template];

    // Fonte única: os dois pontos de uso chamam personalizePreview com a MESMA entrada.
    const expected = personalizePreview(MSG, { name: 'João Silva', nickname: null, company: 'Sua Empresa' });
    expect(expected).toBe('Olá João da Sua Empresa');

    render(<TalkXCampaignWizard campaign={{ id: 'draft-1', name: 'Teste', status: 'draft', message_template: MSG } as never} onClose={vi.fn()} />);
    render(<TalkXTemplateEditor templates={[template] as never} isLoading={false} editing={template as never} onClose={vi.fn()} />);

    // A prévia é renderizada uma vez no rail do wizard e uma vez na moldura do editor.
    const occurrences = (document.body.textContent ?? '').split(expected).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('o editor de template usa a mesma toolbar do editor compartilhado', () => {
    const template = makeTemplate();
    render(<TalkXTemplateEditor templates={[template] as never} isLoading={false} editing={template as never} onClose={vi.fn()} />);
    expect(screen.getByTitle('Negrito (*texto*)')).toBeInTheDocument();
    expect(screen.getByTitle('Inserir variável')).toBeInTheDocument();
    expect(screen.getByText('27/1024')).toBeInTheDocument();
  });

  it('abrir um template e não alterar nada não marca alteração ao sair', () => {
    const template = makeTemplate();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    render(<TalkXTemplateEditor templates={[template] as never} isLoading={false} editing={template as never} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('alterar só a mídia já marca alteração ao sair', () => {
    const template = makeTemplate();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    render(<TalkXTemplateEditor templates={[template] as never} isLoading={false} editing={template as never} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Imagem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(confirmSpy).toHaveBeenCalledWith('Descartar alterações?');
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/* E73 / R2-MOD-027 — sair do wizard antes do autosave não perde nada  */
/* ------------------------------------------------------------------ */

describe('useCampaignEditor — E73 (saída do wizard antes do autosave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.saveDraft.mockClear();
    f.replace.mockResolvedValue(1);
    f.snapshot.mockResolvedValue({ eligible: 1, suppressed: 0, skipped_invalid: 0 });
    f.start.mockResolvedValue(true);
    f.log.mockResolvedValue({});
    f.persistedRecipientIds = [];
    f.templates = [];
    f.profile = { id: 'profile-1', name: 'Ana Silva', email: 'ana@example.com' };
    f.segments = [];
    f.connections = [{ id: 'connection-1', name: 'Principal', status: 'connected', instance_id: 'evolution-principal' }];
    f.queryCalls.length = 0;
    f.resolveAudience.mockResolvedValue(f.contacts);
    f.countAudience.mockResolvedValue(f.contacts.length);
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  /** Nome digitado no passo 1 do wizard real. */
  const NAME_INPUT = /Lançamento Linha Office/i;

  /** Deixa a Promise do flush pendente terminar (microtasks + timers zerados). */
  async function flushMicrotasks() {
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  }

  it('desmontar o wizard antes dos 3 s do autosave grava a edição pendente', async () => {
    // Caminho do histórico do navegador / troca de rota: o pai desmonta o
    // wizard e nenhum beforeunload é disparado.
    const { unmount } = render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(NAME_INPUT), { target: { value: 'Campanha interrompida' } });

    unmount();
    await flushMicrotasks();

    expect(f.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Campanha interrompida' }));
  });

  it('clicar Voltar com alteração pendente para no aviso e grava ao escolher salvar', async () => {
    function ExitHarness() {
      const [open, setOpen] = useState(true);
      return open
        ? <TalkXCampaignWizard campaign={null} onClose={() => setOpen(false)} />
        : <p>Lista de campanhas</p>;
    }
    render(<ExitHarness />);
    fireEvent.change(screen.getByPlaceholderText(NAME_INPUT), { target: { value: 'Campanha Voltar' } });

    // TL-138: com alteração pendente a saída deixa de ser imediata — o wizard
    // para no aviso do kit e só desmonta depois da escolha do operador.
    await act(async () => { screen.getByRole('button', { name: 'Voltar' }).click(); });
    expect(screen.getByText('Você tem alterações não salvas')).toBeInTheDocument();
    expect(screen.queryByText('Lista de campanhas')).not.toBeInTheDocument();

    await act(async () => { screen.getByRole('button', { name: 'Salvar e sair' }).click(); });
    await flushMicrotasks();

    expect(screen.getByText('Lista de campanhas')).toBeInTheDocument();
    expect(f.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Campanha Voltar' }));
  });

  it('sair sem alteração pendente não cria rascunho nenhum', async () => {
    const { unmount } = render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);

    unmount();
    await flushMicrotasks();

    expect(f.saveDraft).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });

  it('sair depois de o autosave confirmar não grava de novo', async () => {
    const { unmount } = render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(NAME_INPUT), { target: { value: 'Campanha salva' } });

    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(f.saveDraft).toHaveBeenCalledTimes(1);

    unmount();
    await flushMicrotasks();

    expect(f.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('o aviso de saída da aba só aparece com alteração realmente pendente', () => {
    // Rascunho já salvo (com nome, responsável e conexão): abrir sem editar não
    // deixa alteração pendente — o aviso antigo disparava só por ter nome/contato.
    render(<TalkXCampaignWizard campaign={{ id: 'draft-1', name: 'Rascunho salvo', status: 'draft', owner: 'profile-1', whatsapp_connection_id: 'connection-1' } as never} onClose={vi.fn()} />);
    const pristine = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pristine);
    expect(pristine.defaultPrevented).toBe(false);

    // Qualquer edição ainda não confirmada passa a ser anunciada.
    fireEvent.change(screen.getByPlaceholderText(NAME_INPUT), { target: { value: 'Rascunho salvo editado' } });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
