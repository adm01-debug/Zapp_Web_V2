import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * t_1944d290 — falha de leitura do NPS não pode aparecer como "nenhuma pesquisa".
 * Antes, o `catch` do hook engolia o erro: a base ficava vazia e o painel pintava
 * NPS 0 e contadores zerados como se fossem dado real.
 */
const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { from, select, order, limit };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));

import { NPS_SURVEY_LIMIT, useNPSSurveys } from '../useNPSSurveys';

function linha(id: string, score: number) {
  return {
    id,
    contact_id: 'c1',
    agent_id: null,
    score,
    feedback: null,
    survey_type: 'manual',
    created_at: '2026-10-10T12:00:00.000Z',
  };
}

describe('useNPSSurveys — leitura da base de NPS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falha de leitura vira `error` e NÃO passa como base vazia', async () => {
    mocks.limit.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table nps_surveys' },
    });

    const { result } = renderHook(() => useNPSSurveys());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('permission denied for table nps_surveys');
    // Sem o estado de erro o painel mostrava "NPS Score 0 / Neutro" com este dado.
    expect(result.current.surveys).toEqual([]);
    expect(result.current.metrics.totalResponses).toBe(0);
    expect(result.current.isTruncated).toBe(false);
  });

  it('leitura boa não marca erro', async () => {
    mocks.limit.mockResolvedValue({ data: [linha('s1', 10)], error: null });

    const { result } = renderHook(() => useNPSSurveys());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.metrics.totalResponses).toBe(1);
    expect(result.current.isTruncated).toBe(false);
  });

  it('teto de leitura atingido marca isTruncated (a agregação é no cliente)', async () => {
    const cheio = Array.from({ length: NPS_SURVEY_LIMIT }, (_, i) => linha(`s${i}`, 10));
    mocks.limit.mockResolvedValue({ data: cheio, error: null });

    const { result } = renderHook(() => useNPSSurveys());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTruncated).toBe(true);
    expect(result.current.metrics.totalResponses).toBe(NPS_SURVEY_LIMIT);
  });

  it('refetch limpa o erro quando a leitura volta a funcionar', async () => {
    mocks.limit.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    mocks.limit.mockResolvedValueOnce({ data: [linha('s1', 9)], error: null });

    const { result } = renderHook(() => useNPSSurveys());

    await waitFor(() => expect(result.current.error).toBe('network error'));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.metrics.totalResponses).toBe(1);
  });
});
