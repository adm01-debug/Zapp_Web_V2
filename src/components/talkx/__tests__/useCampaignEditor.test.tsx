import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saveDraft: vi.fn(), replace: vi.fn(), start: vi.fn(), log: vi.fn(),
  contacts: [{ id: 'contact-1', name: 'Ana Silva', nickname: null, phone: '5511999999999', company: 'Acme', avatar_url: null, tags: ['VIP'] }],
  connections: [{ id: 'connection-1', name: 'Principal', status: 'connected' }],
  blacklist: { ids: new Set<string>(), phones: new Set<string>() },
  persistedRecipientIds: [] as { contact_id: string }[] | undefined,
  templates: [] as { id: string; content: string; media_url: string | null; media_type?: string | null; use_count: number }[],
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
    startCampaign: f.start,
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useTalkXSegments: () => ({ segments: [] }),
  resolveAudience: vi.fn(), countAudience: vi.fn(),
}));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: f.templates, registerUse: vi.fn() }) }));
vi.mock('@/hooks/integrations/useTalkXEvents', () => ({ useTalkXEventLogger: () => f.log }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'wa-connections-talkx' ? f.connections
      : queryKey[0] === 'contacts-talkx' ? f.contacts
      : queryKey[0] === 'talkx-draft-recipient-ids' ? f.persistedRecipientIds?.map((recipient) => recipient.contact_id)
        : queryKey[0] === 'talkx-blacklist-ids' ? f.blacklist : undefined,
  }),
}));

import { localToUTCInTimezone, useCampaignEditor } from '@/components/talkx/useCampaignEditor';
import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';

describe('useCampaignEditor — draft integrity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.saveDraft.mockClear();
    f.replace.mockResolvedValue(1);
    f.start.mockResolvedValue(true);
    f.log.mockResolvedValue({});
    f.blacklist.ids.clear();
    f.blacklist.phones.clear();
    f.persistedRecipientIds = [];
    f.templates = [];
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

  it('creates one draft and atomically replaces its recipient snapshot on later saves', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => { result.current.setName('Campanha de teste'); result.current.toggleContact('contact-1'); });

    await act(async () => { await result.current.handleSave('draft'); });
    await act(async () => { await result.current.handleSave('draft'); });

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1' }));
    expect(f.replace).toHaveBeenCalledTimes(2);
    expect(f.replace).toHaveBeenLastCalledWith({ campaignId: 'draft-1', contactIds: ['contact-1'] });
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

  it('autosaves a changed manual selection against the existing draft identity', async () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setName('Campanha de teste'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    act(() => result.current.toggleContact('contact-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenLastCalledWith({ campaignId: 'draft-1', contactIds: ['contact-1'] });
  });

  it('autosaves all persisted audience filters', async () => {
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));
    await act(async () => {});
    f.update.mockClear();

    act(() => result.current.setCompanyFilter('Acme'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-1',
      audience_filters: expect.objectContaining({ company: 'Acme' }),
    }));

    f.update.mockClear();
    act(() => result.current.setCompanyFilter('all'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-1',
      audience_filters: expect.objectContaining({ company: 'all' }),
    }));
  });

  it('does not overwrite an existing audience before its snapshot hydrates', async () => {
    f.persistedRecipientIds = undefined;
    const campaign = { id: 'draft-1', name: 'Rascunho', status: 'draft' };
    const { result } = renderHook(() => useCampaignEditor(campaign as never, vi.fn()));

    await act(async () => {
      await expect(result.current.handleSave('draft')).rejects.toThrow('audiência deste rascunho ainda está carregando');
    });
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

  it('clears text search together with the other audience filters', () => {
    const { result } = renderHook(() => useCampaignEditor(null, vi.fn()));
    act(() => result.current.setContactSearch('ausente'));
    act(() => result.current.clearFilters());
    expect(result.current.contactSearch).toBe('');
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

  it('does not record a false started event when the send request is rejected', async () => {
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
    expect(f.log).toHaveBeenCalledWith('draft-1', 'created', 'Campanha criada');
    expect(f.log).not.toHaveBeenCalledWith('draft-1', 'started', 'Envio iniciado manualmente');
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
