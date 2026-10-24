/**
 * CV-065, CV-066 — testes do hook useCopilotFeedback.
 *
 * Verifica:
 *  - classifyEdit: igual (0%), pouco (≤30%), muito (>30%)
 *  - recordEditDistance registra o nível correto
 *  - recordFeedback registra rating e motivo
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stuba o Supabase antes de importar o hook
const { mockInsert, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  return { mockInsert, mockFrom };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useCopilotFeedback } from '../useCopilotFeedback';

describe('useCopilotFeedback', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockInsert.mockClear();
  });

  it('recordEditDistance: textos idênticos → nivel "igual"', async () => {
    const { result } = renderHook(() =>
      useCopilotFeedback({ conversationId: 'conv1', contactId: 'c1' }),
    );

    act(() => { result.current.recordEditDistance('mensagem exata', 'mensagem exata'); });

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.edit_level).toBe('igual');
  });

  it('recordEditDistance: textos muito diferentes → nivel "muito"', async () => {
    const { result } = renderHook(() =>
      useCopilotFeedback({ conversationId: 'conv1', contactId: 'c1' }),
    );

    act(() => {
      result.current.recordEditDistance('abc', 'completamente diferente texto');
    });

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.edit_level).toBe('muito');
  });

  it('recordEditDistance: não chama insert se sugestão vazia', () => {
    const { result } = renderHook(() =>
      useCopilotFeedback({ conversationId: 'conv1', contactId: 'c1' }),
    );

    act(() => { result.current.recordEditDistance('', 'qualquer texto'); });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('recordFeedback: registra rating positive', async () => {
    const { result } = renderHook(() =>
      useCopilotFeedback({ conversationId: 'conv1', contactId: 'c1' }),
    );

    act(() => { result.current.recordFeedback('sug-1', 'positive'); });

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.rating).toBe('positive');
    expect(insertArg.reason).toBeNull();
    expect(insertArg.feedback_type).toBe('thumbs');
  });

  it('recordFeedback: registra rating negative com motivo', async () => {
    const { result } = renderHook(() =>
      useCopilotFeedback({ conversationId: 'conv1', contactId: 'c1' }),
    );

    act(() => { result.current.recordFeedback('sug-2', 'negative', 'tom_errado'); });

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.rating).toBe('negative');
    expect(insertArg.reason).toBe('tom_errado');
  });
});
