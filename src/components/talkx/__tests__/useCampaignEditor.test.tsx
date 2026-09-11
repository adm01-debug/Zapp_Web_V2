import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), replace: vi.fn(), start: vi.fn(), log: vi.fn(),
  contacts: [{ id: 'contact-1', name: 'Ana Silva', nickname: null, phone: '5511999999999', company: 'Acme', avatar_url: null, tags: ['VIP'] }],
  connections: [{ id: 'connection-1', name: 'Principal', status: 'connected' }],
  blacklist: { ids: new Set<string>(), phones: new Set<string>() },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    createCampaign: { mutateAsync: f.create },
    updateCampaign: { mutateAsync: f.update },
    replaceDraftRecipients: { mutateAsync: f.replace },
    startCampaign: f.start,
  }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useTalkXSegments: () => ({ segments: [] }),
  resolveAudience: vi.fn(), countAudience: vi.fn(),
}));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({ useTalkXTemplates: () => ({ templates: [], registerUse: vi.fn() }) }));
vi.mock('@/hooks/integrations/useTalkXEvents', () => ({ useTalkXEventLogger: () => f.log }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'wa-connections-talkx' ? f.connections
      : queryKey[0] === 'contacts-talkx' ? f.contacts
        : queryKey[0] === 'talkx-blacklist-ids' ? f.blacklist : undefined,
  }),
}));

import { useCampaignEditor } from '@/components/talkx/useCampaignEditor';

describe('useCampaignEditor — draft integrity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f.create.mockResolvedValue({ id: 'draft-1' });
    f.update.mockResolvedValue({});
    f.replace.mockResolvedValue(1);
    f.log.mockResolvedValue({});
    f.blacklist.ids.clear();
    f.blacklist.phones.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it('uses the requested valid wizard step and rejects an invalid value', () => {
    window.history.replaceState(null, '', '/?view=talkx&wizard=new&step=3');
    const { result, unmount } = renderHook(() => useCampaignEditor(null, vi.fn()));
    expect(result.current.step).toBe(3);
    unmount();

    window.history.replaceState(null, '', '/?step=99');
    const invalid = renderHook(() => useCampaignEditor(null, vi.fn()));
    expect(invalid.result.current.step).toBe(1);
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
});
