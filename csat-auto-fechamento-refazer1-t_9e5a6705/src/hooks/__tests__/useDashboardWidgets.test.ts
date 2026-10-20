import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDashboardWidgets } from '@/hooks/analytics/useDashboardWidgets';

describe('useDashboardWidgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes with default widgets', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    expect(result.current.widgets.length).toBeGreaterThan(0);
  });

  it('all widgets have required fields', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.widgets.forEach(w => {
      expect(w.id).toBeTruthy();
      expect(w.title).toBeTruthy();
      expect(w.type).toBeTruthy();
      expect(typeof w.visible).toBe('boolean');
      expect(typeof w.order).toBe('number');
      expect([1, 2, 3]).toContain(w.level);
    });
  });

  it('visibleWidgets only contains visible widgets', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.visibleWidgets.forEach(w => {
      expect(w.visible).toBe(true);
    });
  });

  it('level1Widgets contains only level 1', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.level1Widgets.forEach(w => {
      expect(w.level).toBe(1);
    });
    expect(result.current.level1Widgets.length).toBeGreaterThan(0);
  });

  it('level2Widgets contains only level 2', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.level2Widgets.forEach(w => expect(w.level).toBe(2));
  });

  it('level3Widgets contains only level 3', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.level3Widgets.forEach(w => expect(w.level).toBe(3));
  });

  it('toggleWidgetVisibility hides a widget', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => {
      result.current.toggleWidgetVisibility(firstId);
    });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.visible).toBe(false);
  });

  it('toggleWidgetVisibility toggles back', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => { result.current.toggleWidgetVisibility(firstId); });
    act(() => { result.current.toggleWidgetVisibility(firstId); });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.visible).toBe(true);
  });

  it('updateWidgetSize changes size', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => {
      result.current.updateWidgetSize(firstId, 'small');
    });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.size).toBe('small');
    expect(widget?.width).toBe(1);
  });

  it('updateWidgetPosition updates column and row', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => {
      result.current.updateWidgetPosition(firstId, 2, 3);
    });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.column).toBe(2);
    expect(widget?.row).toBe(3);
  });

  it('moveWidget moves up', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const widget = result.current.widgets.find(w => (w.row ?? 0) > 0);
    if (!widget) return;

    const originalRow = widget.row ?? 0;
    act(() => { result.current.moveWidget(widget.id, 'up'); });

    const updated = result.current.widgets.find(w => w.id === widget.id);
    expect(updated?.row).toBe(Math.max(0, originalRow - 1));
  });

  it('moveWidget respects left boundary', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => { result.current.updateWidgetPosition(firstId, 0, 0); });
    act(() => { result.current.moveWidget(firstId, 'left'); });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.column).toBe(0);
  });

  it('moveWidget respects right boundary (max 3)', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstId = result.current.widgets[0].id;

    act(() => { result.current.updateWidgetPosition(firstId, 3, 0); });
    act(() => { result.current.moveWidget(firstId, 'right'); });

    const widget = result.current.widgets.find(w => w.id === firstId);
    expect(widget?.column).toBe(3);
  });

  it('reorderWidgets swaps order', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const firstWidget = result.current.widgets[0];
    const secondWidget = result.current.widgets[1];

    act(() => {
      result.current.reorderWidgets(0, 1);
    });

    expect(result.current.widgets[0].id).toBe(secondWidget.id);
    expect(result.current.widgets[1].id).toBe(firstWidget.id);
  });

  it('resetToDefaults restores original config', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => { result.current.toggleWidgetVisibility(result.current.widgets[0].id); });
    act(() => { result.current.resetToDefaults(); });

    result.current.widgets.forEach(w => expect(w.visible).toBe(true));
  });

  it('persists config to localStorage', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => {
      result.current.toggleWidgetVisibility(result.current.widgets[0].id);
    });

    const stored = localStorage.getItem('dashboard-widgets-config-v3');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed[0].visible).toBe(false);
  });

  it('loads config from localStorage on mount', () => {
    const customConfig = [
      { id: 'stats', visible: false, order: 0 },
    ];
    localStorage.setItem('dashboard-widgets-config-v3', JSON.stringify(customConfig));

    const { result } = renderHook(() => useDashboardWidgets());
    const statsWidget = result.current.widgets.find(w => w.id === 'stats');
    expect(statsWidget?.visible).toBe(false);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('dashboard-widgets-config-v3', 'invalid-json');
    const { result } = renderHook(() => useDashboardWidgets());
    expect(result.current.widgets.length).toBeGreaterThan(0);
  });

  it('isEditMode defaults to false', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    expect(result.current.isEditMode).toBe(false);
  });

  it('setIsEditMode toggles edit mode', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => { result.current.setIsEditMode(true); });
    expect(result.current.isEditMode).toBe(true);

    act(() => { result.current.setIsEditMode(false); });
    expect(result.current.isEditMode).toBe(false);
  });

  it('no duplicate widget IDs', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const ids = result.current.widgets.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all size values are valid', () => {
    const validSizes = ['small', 'medium', 'large', 'full'];
    const { result } = renderHook(() => useDashboardWidgets());
    result.current.widgets.forEach(w => {
      expect(validSizes).toContain(w.size);
    });
  });
});
