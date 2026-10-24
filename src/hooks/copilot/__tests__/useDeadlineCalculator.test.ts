import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeadlineCalculator } from '../useDeadlineCalculator';

const invokeEdgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const BASE_OPTIONS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  messages: [{ content: 'preciso para 15/11', sender: 'contact' }],
};

describe('useDeadlineCalculator', () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it('popula deadline viável', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: {
        deadline: {
          productionDays: 7,
          shippingDays: 3,
          bufferDays: 2,
          latestOrderDate: '2026-11-03',
          eventDate: '2026-11-15',
          feasible: true,
        },
        impossibleDeadline: false,
      },
      error: null,
    });
    const { result } = renderHook(() => useDeadlineCalculator(BASE_OPTIONS));
    await act(async () => result.current.analyze('preciso para 15/11'));
    expect(result.current.state.impossibleDeadline).toBe(false);
    expect(result.current.state.deadline?.feasible).toBe(true);
    expect(result.current.state.deadline?.productionDays).toBe(7);
  });

  it('sinaliza prazo impossível', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: {
        impossibleDeadline: true,
        impossibleReason: 'Prazo muito curto para produção',
      },
      error: null,
    });
    const { result } = renderHook(() => useDeadlineCalculator(BASE_OPTIONS));
    await act(async () => result.current.analyze('quero para amanhã'));
    expect(result.current.state.impossibleDeadline).toBe(true);
    expect(result.current.state.impossibleReason).toContain('Prazo muito curto');
  });
});
