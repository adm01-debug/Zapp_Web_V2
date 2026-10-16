import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationMemory } from '@/hooks/crm/useConversationMemory';

const h = vi.hoisted(() => ({
  state: {
    row: null as null | {
      facts: unknown;
      objections_handled: unknown;
      promises_made: unknown;
      pending_items: unknown;
      commercial_summary: string | null;
      cumulative_summary: string | null;
      updated_at: string | null;
    },
    error: null as null | { message: string },
  },
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: h.select })) },
}));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }));

function linha(resumo: string) {
  return {
    facts: [],
    objections_handled: [],
    promises_made: [],
    pending_items: [],
    commercial_summary: resumo,
    cumulative_summary: null,
    updated_at: '2026-10-15T12:00:00Z',
  };
}

describe('useConversationMemory — reload (releitura do painel)', () => {
  beforeEach(() => {
    h.state.row = linha('Resumo versão 1.');
    h.state.error = null;
    h.maybeSingle.mockReset().mockImplementation(async () => ({ data: h.state.row, error: h.state.error }));
    h.eq.mockReset().mockImplementation(() => ({ maybeSingle: h.maybeSingle }));
    h.select.mockReset().mockImplementation(() => ({ eq: h.eq }));
  });

  it('reload() relê o banco e o painel mostra o valor novo', async () => {
    const { result } = renderHook(() => useConversationMemory('contato-1'));

    await waitFor(() => expect(result.current.memory?.commercialSummary).toBe('Resumo versão 1.'));
    const chamadasAntes = h.maybeSingle.mock.calls.length;

    h.state.row = linha('Resumo versão 2, recém-salva.');
    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.memory?.commercialSummary).toBe('Resumo versão 2, recém-salva.'));
    expect(h.maybeSingle.mock.calls.length).toBeGreaterThan(chamadasAntes);
  });

  it('sem reload o painel mantém o valor antigo (a releitura é manual)', async () => {
    const { result } = renderHook(() => useConversationMemory('contato-1'));

    await waitFor(() => expect(result.current.memory?.commercialSummary).toBe('Resumo versão 1.'));
    const chamadasAntes = h.maybeSingle.mock.calls.length;

    h.state.row = linha('Resumo versão 2, ainda não relida.');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.memory?.commercialSummary).toBe('Resumo versão 1.');
    expect(h.maybeSingle.mock.calls.length).toBe(chamadasAntes);
  });
});
