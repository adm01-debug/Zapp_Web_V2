/**
 * Tests for Phase 15 hooks: useRadarOrchestrator, useRadarPersistence, useRadarKeyboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRadarOrchestrator } from '../useRadarOrchestrator';
import { useRadarPersistence } from '../useRadarPersistence';
import { useRadarKeyboard } from '../useRadarKeyboard';

// ---------------------------------------------------------------------------
// useRadarOrchestrator
// ---------------------------------------------------------------------------

describe('useRadarOrchestrator', () => {
  it('returns all expected fields with defaults', () => {
    const { result } = renderHook(() => useRadarOrchestrator());
    const state = result.current;

    expect(state).toHaveProperty('ghostTextEnabled', true);
    expect(state).toHaveProperty('hasActiveObjection', false);
    expect(state).toHaveProperty('lossRiskLevel', 'none');
    expect(state).toHaveProperty('hasProductRecommendation', false);
    expect(state).toHaveProperty('hasQuoteDraft', false);
    expect(state).toHaveProperty('leadTemperature', 50);
    expect(state).toHaveProperty('speedToLeadAlertLevel', 'none');
    expect(state).toHaveProperty('multimodalPrimaryAction', null);
    expect(state).toHaveProperty('hasPrivacyViolation', false);
    expect(state).toHaveProperty('supervisorAlertCount', 0);
    expect(state).toHaveProperty('copilotAcceptanceRate', 0);
    expect(state).toHaveProperty('activeFeatureCount');
    expect(state).toHaveProperty('overallRadarScore');
  });

  it('computes overallRadarScore correctly', () => {
    const { result } = renderHook(() =>
      useRadarOrchestrator({
        leadTemperature: 100,
        lossRiskLevel: 'none',
        hasActiveObjection: false,
        copilotAcceptanceRate: 1,
      })
    );
    // 100*0.3 + 0 + 0 + 1*20 = 30 + 20 = 50
    expect(result.current.overallRadarScore).toBe(50);
  });

  it('applies loss risk and objection penalties', () => {
    const { result } = renderHook(() =>
      useRadarOrchestrator({
        leadTemperature: 80,
        lossRiskLevel: 'high',
        hasActiveObjection: true,
        copilotAcceptanceRate: 0,
      })
    );
    // 80*0.3 - 20 - 10 + 0 = 24 - 30 = -6 → clamped to 0
    expect(result.current.overallRadarScore).toBe(0);
  });

  it('counts active features', () => {
    const { result } = renderHook(() =>
      useRadarOrchestrator({
        hasActiveObjection: true,
        hasProductRecommendation: true,
        hasPrivacyViolation: true,
      })
    );
    // ghostTextEnabled(default true) + hasActiveObjection + hasProductRecommendation + hasPrivacyViolation = 4
    expect(result.current.activeFeatureCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// useRadarPersistence
// ---------------------------------------------------------------------------

describe('useRadarPersistence', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('returns default state when nothing is stored', () => {
    const { result } = renderHook(() => useRadarPersistence('conv-1'));
    expect(result.current.state.panelMode).toBe('normal');
    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.ghostTextEnabled).toBe(true);
    expect(result.current.state.collapsedCards).toEqual([]);
  });

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useRadarPersistence('conv-2'));
    act(() => {
      result.current.update({ isOpen: true, panelMode: 'focus' });
    });
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.panelMode).toBe('focus');

    // Verify it was written to storage
    const stored = JSON.parse(localStorage.getItem('radar-state-conv-2') ?? '{}');
    expect(stored.isOpen).toBe(true);
    expect(stored.panelMode).toBe('focus');
  });

  it('reads existing state from localStorage on mount', () => {
    try {
      localStorage.setItem(
        'radar-state-conv-3',
        JSON.stringify({ panelMode: 'mini', isOpen: true, collapsedCards: ['objection'], ghostTextEnabled: false })
      );
    } catch { /* ignore */ }

    const { result } = renderHook(() => useRadarPersistence('conv-3'));
    expect(result.current.state.panelMode).toBe('mini');
    expect(result.current.state.isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useRadarKeyboard
// ---------------------------------------------------------------------------

describe('useRadarKeyboard', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>;
  let removeEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventSpy = vi.spyOn(window, 'addEventListener');
    removeEventSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventSpy.mockRestore();
    removeEventSpy.mockRestore();
  });

  it('registers keydown listener on mount', () => {
    renderHook(() => useRadarKeyboard({}));
    expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('unregisters listener on unmount', () => {
    const { unmount } = renderHook(() => useRadarKeyboard({}));
    unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('returns the static shortcuts list', () => {
    const { result } = renderHook(() => useRadarKeyboard({}));
    expect(result.current.shortcuts).toHaveLength(4);
    expect(result.current.shortcuts[0].keys).toBe('Ctrl+Shift+R');
  });

  it('calls onTogglePanel when Ctrl+Shift+R is pressed', () => {
    const onTogglePanel = vi.fn();
    renderHook(() => useRadarKeyboard({ onTogglePanel }));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'R', ctrlKey: true, shiftKey: true, bubbles: true })
      );
    });

    expect(onTogglePanel).toHaveBeenCalledTimes(1);
  });
});
