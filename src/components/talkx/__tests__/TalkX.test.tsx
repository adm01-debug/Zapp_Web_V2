import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id', name: 'Test' }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
  return {
    supabase: {
      from: mockFrom,
      functions: { invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }) },
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockImplementation((cb) => { if (cb) cb('SUBSCRIBED'); return {}; }),
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useTalkX } from '@/hooks/integrations/useTalkX';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useTalkX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty campaigns', async () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.campaigns).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('has null selectedCampaignId by default', () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    expect(result.current.selectedCampaignId).toBeNull();
  });

  it('setSelectedCampaignId updates state', () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    act(() => result.current.setSelectedCampaignId('test-id'));
    expect(result.current.selectedCampaignId).toBe('test-id');
  });

  it('recipients are empty when no campaign selected', async () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.recipients).toEqual([]);
    });
  });

  it('exposes all mutation functions', () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    expect(result.current.createCampaign).toBeDefined();
    expect(result.current.updateCampaign).toBeDefined();
    expect(result.current.deleteCampaign).toBeDefined();
    expect(result.current.addRecipients).toBeDefined();
    expect(typeof result.current.startCampaign).toBe('function');
    expect(typeof result.current.pauseCampaign).toBe('function');
    expect(typeof result.current.cancelCampaign).toBe('function');
  });

  it('exposes refetchCampaigns', () => {
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });
    expect(typeof result.current.refetchCampaigns).toBe('function');
  });

  it('rejects an operationally refused start even when the edge function returns HTTP 200', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { ok: false, reason: 'outside_send_window' },
      error: null,
    } as never);
    const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });

    await expect(result.current.startCampaign('campaign-1')).resolves.toBe(false);
  });

  it.each(['pauseCampaign', 'cancelCampaign'] as const)(
    'rejects an operationally refused %s even when the edge function returns HTTP 200',
    async (action) => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, reason: 'transition_denied' },
        error: null,
      } as never);
      const { result } = renderHook(() => useTalkX(), { wrapper: createWrapper() });

      await expect(result.current[action]('campaign-1')).rejects.toThrow('transition_denied');
    },
  );
});

describe('Talk X — Personalization Engine', () => {
  // Test the personalization logic that the edge function uses
  function personalize(
    template: string,
    contact: { name: string; nickname?: string; company?: string }
  ): string {
    const firstName = contact.name?.split(' ')[0] || '';
    const hour = 10; // simulate morning
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return template
      .replace(/\{\{nome\}\}/gi, firstName)
      .replace(/\{\{nome_completo\}\}/gi, contact.name || '')
      .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
      .replace(/\{\{empresa\}\}/gi, contact.company || '')
      .replace(/\{\{saudacao\}\}/gi, greeting);
  }

  it('replaces {{nome}} with first name', () => {
    const result = personalize('Olá, {{nome}}!', { name: 'João Silva' });
    expect(result).toBe('Olá, João!');
  });

  it('replaces {{nome_completo}} with full name', () => {
    const result = personalize('Sr. {{nome_completo}}', { name: 'João Carlos Silva' });
    expect(result).toBe('Sr. João Carlos Silva');
  });

  it('replaces {{apelido}} with nickname when available', () => {
    const result = personalize('E aí, {{apelido}}!', { name: 'João Silva', nickname: 'Joãozinho' });
    expect(result).toBe('E aí, Joãozinho!');
  });

  it('falls back to first name when no nickname', () => {
    const result = personalize('Fala, {{apelido}}!', { name: 'João Silva' });
    expect(result).toBe('Fala, João!');
  });

  it('replaces {{empresa}} with company', () => {
    const result = personalize('Novidades da {{empresa}}', { name: 'João', company: 'Acme Ltda' });
    expect(result).toBe('Novidades da Acme Ltda');
  });

  it('replaces {{empresa}} with empty when no company', () => {
    const result = personalize('Empresa: {{empresa}}', { name: 'João' });
    expect(result).toBe('Empresa: ');
  });

  it('replaces {{saudacao}} with greeting', () => {
    const result = personalize('{{saudacao}}, {{nome}}!', { name: 'Maria' });
    expect(result).toBe('Bom dia, Maria!');
  });

  it('handles multiple variables in same template', () => {
    const result = personalize(
      '{{saudacao}}, {{apelido}}! Aqui é da {{empresa}}.',
      { name: 'Carlos Souza', nickname: 'Carlão', company: 'TechCorp' }
    );
    expect(result).toBe('Bom dia, Carlão! Aqui é da TechCorp.');
  });

  it('handles template with no variables', () => {
    const result = personalize('Mensagem fixa sem variáveis', { name: 'Test' });
    expect(result).toBe('Mensagem fixa sem variáveis');
  });

  it('is case-insensitive for variable names', () => {
    const result = personalize('{{NOME}} {{Nome}} {{nome}}', { name: 'Ana Luiza' });
    expect(result).toBe('Ana Ana Ana');
  });

  it('handles empty name gracefully', () => {
    const result = personalize('Olá {{nome}}!', { name: '' });
    expect(result).toBe('Olá !');
  });

  it('handles emoji in template', () => {
    const result = personalize('🎉 {{saudacao}}, {{nome}}! 🚀', { name: 'Pedro' });
    expect(result).toBe('🎉 Bom dia, Pedro! 🚀');
  });
});

describe('Talk X — Estimated Time Calculator', () => {
  function estimateTime(
    contactCount: number,
    typingDelay: [number, number],
    sendInterval: [number, number]
  ): string | null {
    if (contactCount === 0) return null;
    const avgTyping = (typingDelay[0] + typingDelay[1]) / 2;
    const avgInterval = (sendInterval[0] + sendInterval[1]) / 2;
    const totalSeconds = contactCount * (avgTyping + avgInterval);
    const minutes = Math.ceil(totalSeconds / 60);
    if (minutes < 60) return `~${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainMin = minutes % 60;
    return `~${hours}h${remainMin > 0 ? ` ${remainMin}min` : ''}`;
  }

  it('returns null for 0 contacts', () => {
    expect(estimateTime(0, [1.5, 4], [5, 15])).toBeNull();
  });

  it('calculates minutes correctly', () => {
    // 10 contacts * (2.75 + 10) avg = 127.5s ≈ 3 min
    expect(estimateTime(10, [1.5, 4], [5, 15])).toBe('~3 min');
  });

  it('calculates hours for large batches', () => {
    // 500 contacts * (2.75 + 10) = 6375s = 106.25 min ≈ 1h 47min
    expect(estimateTime(500, [1.5, 4], [5, 15])).toBe('~1h 47min');
  });

  it('handles exact hour', () => {
    // Need to find values that give exactly 60 min
    // contacts * (avg) = 3600s → contacts=360 with avg=10
    expect(estimateTime(360, [5, 5], [5, 5])).toBe('~1h');
  });

  it('handles single contact', () => {
    // 1 * (2.75 + 10) = 12.75s ≈ 1 min
    expect(estimateTime(1, [1.5, 4], [5, 15])).toBe('~1 min');
  });
});

describe('Talk X — Contact Filter', () => {
  const contacts = [
    { id: '1', name: 'João Silva', nickname: 'Joãozinho', phone: '5511999991111', company: 'Acme' },
    { id: '2', name: 'Maria Santos', nickname: null, phone: '5511999992222', company: 'TechCorp' },
    { id: '3', name: 'Pedro Alves', nickname: 'Pedrão', phone: '5521888883333', company: 'Acme' },
  ];

  function filterContacts(list: typeof contacts, query: string) {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.nickname?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.company?.toLowerCase().includes(q)
    );
  }

  it('returns all contacts when query is empty', () => {
    expect(filterContacts(contacts, '')).toHaveLength(3);
  });

  it('filters by name', () => {
    expect(filterContacts(contacts, 'João')).toHaveLength(1);
    expect(filterContacts(contacts, 'João')[0].id).toBe('1');
  });

  it('filters by nickname', () => {
    expect(filterContacts(contacts, 'Pedrão')).toHaveLength(1);
  });

  it('filters by phone', () => {
    expect(filterContacts(contacts, '5521')).toHaveLength(1);
  });

  it('filters by company', () => {
    expect(filterContacts(contacts, 'Acme')).toHaveLength(2);
  });

  it('is case insensitive', () => {
    expect(filterContacts(contacts, 'maria')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(filterContacts(contacts, 'zzzzz')).toHaveLength(0);
  });

  it('handles whitespace-only query as empty', () => {
    expect(filterContacts(contacts, '   ')).toHaveLength(3);
  });
});
