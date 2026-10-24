import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLeadTemperature } from '../useLeadTemperature';

const invokeEdgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const BASE_OPTIONS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  messages: [{ content: 'quero comprar logo', sender: 'contact' }],
};

describe('useLeadTemperature', () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it('calcula temperatura hot', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: {
        score: 75,
        signals: [{ type: 'urgency', strength: 'strong', excerpt: 'quero comprar logo' }],
      },
      error: null,
    });
    const { result } = renderHook(() => useLeadTemperature(BASE_OPTIONS));
    await act(async () => result.current.analyze());
    expect(result.current.state.score).toBe(75);
    expect(result.current.state.label).toBe('hot');
    expect(result.current.state.signals).toHaveLength(1);
  });

  it('label burning para score >= 80', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { score: 90, signals: [] },
      error: null,
    });
    const { result } = renderHook(() => useLeadTemperature(BASE_OPTIONS));
    await act(async () => result.current.analyze());
    expect(result.current.state.label).toBe('burning');
  });

  it('alerta 24h quando lastMessageAt está a 23h30', () => {
    const lastMessageAt = new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() =>
      useLeadTemperature({ ...BASE_OPTIONS, lastMessageAt }),
    );
    expect(result.current.state.whatsapp24hWarning).toBe(true);
  });

  it('sem alerta 24h quando lastMessageAt é recente', () => {
    const lastMessageAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() =>
      useLeadTemperature({ ...BASE_OPTIONS, lastMessageAt }),
    );
    expect(result.current.state.whatsapp24hWarning).toBe(false);
  });
});
