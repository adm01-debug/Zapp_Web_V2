import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLossRisk } from '../useLossRisk';

const invokeEdgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const BASE_OPTIONS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  messages: [{ content: 'vou pensar', sender: 'contact', timestamp: new Date().toISOString() }],
};

describe('useLossRisk', () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it('triggered false quando score abaixo do threshold', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { riskScore: 50, signals: [], recoveryAction: '' },
      error: null,
    });
    const { result } = renderHook(() => useLossRisk(BASE_OPTIONS));
    await act(async () => result.current.analyze());
    expect(result.current.state.triggered).toBe(false);
    expect(result.current.state.riskLevel).toBe('medium');
  });

  it('triggered true quando score >= threshold', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: {
        riskScore: 85,
        signals: [{ type: 'silence', weight: 0.4, description: 'sem resposta há 2h' }],
        recoveryAction: 'Envie uma proposta de valor',
      },
      error: null,
    });
    const { result } = renderHook(() => useLossRisk(BASE_OPTIONS));
    await act(async () => result.current.analyze());
    expect(result.current.state.triggered).toBe(true);
    expect(result.current.state.riskLevel).toBe('critical');
    expect(result.current.state.signals).toHaveLength(1);
  });

  it('dismiss limpa o estado', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { riskScore: 90, signals: [], recoveryAction: 'ação' },
      error: null,
    });
    const { result } = renderHook(() => useLossRisk(BASE_OPTIONS));
    await act(async () => result.current.analyze());
    act(() => result.current.dismiss());
    expect(result.current.state.triggered).toBe(false);
    expect(result.current.state.riskScore).toBe(0);
  });

  it('não analisa se disabled', async () => {
    const { result } = renderHook(() => useLossRisk({ ...BASE_OPTIONS, enabled: false }));
    await act(async () => result.current.analyze());
    expect(invokeEdgeMock).not.toHaveBeenCalled();
  });
});
