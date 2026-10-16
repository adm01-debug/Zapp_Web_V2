import { renderHook } from '@testing-library/react';
import { useFollowUp } from '../useFollowUp';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('useFollowUp', () => {
  it('returns no silence alert for hot lead silent for less than 6h', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-1',
        lastClientMessageAt: hoursAgo(3),
        leadTemperature: 'hot',
      }),
    );
    expect(result.current.silenceAlert).toBeNull();
    expect(result.current.followUp).toBeNull();
  });

  it('returns high priority silence alert for hot lead silent for 48h', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-2',
        lastClientMessageAt: hoursAgo(48),
        leadTemperature: 'hot',
      }),
    );
    expect(result.current.silenceAlert).not.toBeNull();
    expect(result.current.silenceAlert?.priority).toBe('high');
    expect(result.current.silenceAlert?.lastTemperature).toBe('hot');
  });

  it('follow-up message never contains only "e aí" without context', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-3',
        lastClientMessageAt: hoursAgo(24),
        leadTemperature: 'hot',
      }),
    );
    const message = result.current.followUp?.message ?? '';
    // Must not be a bare "e aí?" message
    expect(message.toLowerCase()).not.toMatch(/^e aí\??$/i);
    expect(message.length).toBeGreaterThan(20);
  });

  it('returns low priority alert for warm lead silent for 12h', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-4',
        lastClientMessageAt: hoursAgo(12),
        leadTemperature: 'warm',
      }),
    );
    expect(result.current.silenceAlert).not.toBeNull();
    expect(result.current.silenceAlert?.priority).toBe('low');
  });

  it('returns null when no reference time', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-5',
        leadTemperature: 'hot',
      }),
    );
    expect(result.current.followUp).toBeNull();
    expect(result.current.silenceAlert).toBeNull();
  });

  it('stale conversation reason when agent replied last', () => {
    const { result } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-6',
        lastClientMessageAt: hoursAgo(30),
        lastAgentMessageAt: hoursAgo(28),
        leadTemperature: 'hot',
      }),
    );
    // Agent replied after client — agent's reply is 28h ago, above high threshold (48h for hot)
    // Should be below 48h threshold so should be medium
    expect(result.current.silenceAlert?.priority).toBe('medium');
    expect(result.current.followUp?.reason).toBe('stale_conversation');
  });

  it('closing temperature has lower thresholds', () => {
    const { result: closingResult } = renderHook(() =>
      useFollowUp({
        conversationId: 'conv-7',
        lastClientMessageAt: hoursAgo(5),
        leadTemperature: 'closing',
      }),
    );
    // closing: high threshold is 8h → 5h is medium (>=4h)
    expect(closingResult.current.silenceAlert?.priority).toBe('medium');
  });
});
