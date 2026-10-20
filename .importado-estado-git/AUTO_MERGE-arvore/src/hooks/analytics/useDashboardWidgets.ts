import { useState, useEffect, useCallback } from 'react';

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'stats' | 'challenges' | 'ai-stats' | 'queues' | 'leaderboard' | 'activity' | 'achievements' | 'mini-games';
  visible: boolean;
  order: number;
  size: 'small' | 'medium' | 'large' | 'full';
  column?: number;
  row?: number;
  width?: number;
  height?: number;
  // Progressive Disclosure Level
  level: 1 | 2 | 3; // 1 = Always visible, 2 = Expandable, 3 = On demand
}

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';
export type DisclosureLevel = 1 | 2 | 3;

const defaultWidgets: DashboardWidget[] = [
  // Level 1 - Always Visible: KPIs críticos
  { id: 'stats', title: 'Estatísticas', type: 'stats', visible: true, order: 0, size: 'full', column: 0, row: 0, width: 4, height: 1, level: 1 },
  
  // Level 2 - Expandable: Detalhes operacionais
  { id: 'challenges', title: 'Desafios do Dia', type: 'challenges', visible: true, order: 1, size: 'full', column: 0, row: 1, width: 4, height: 1, level: 2 },
  { id: 'queues', title: 'Status das Filas', type: 'queues', visible: true, order: 2, size: 'medium', column: 0, row: 2, width: 2, height: 1, level: 2 },
  { id: 'activity', title: 'Atividade Recente', type: 'activity', visible: true, order: 3, size: 'medium', column: 2, row: 2, width: 2, height: 1, level: 2 },
  
  // Level 3 - On Demand: Gamificação e extras
  { id: 'ai-stats', title: 'IA Stats', type: 'ai-stats', visible: true, order: 4, size: 'medium', column: 0, row: 3, width: 2, height: 1, level: 3 },
  { id: 'leaderboard', title: 'Ranking', type: 'leaderboard', visible: true, order: 5, size: 'medium', column: 2, row: 3, width: 2, height: 1, level: 3 },
  { id: 'achievements', title: 'Conquistas', type: 'achievements', visible: true, order: 6, size: 'full', column: 0, row: 4, width: 4, height: 1, level: 3 },
  { id: 'mini-games', title: 'Mini-games', type: 'mini-games', visible: true, order: 7, size: 'full', column: 0, row: 5, width: 4, height: 1, level: 3 },
];

const STORAGE_KEY = 'dashboard-widgets-config-v3';

const sizeToGrid: Record<WidgetSize, { width: number; height: number }> = {
  small: { width: 1, height: 1 },
  medium: { width: 2, height: 1 },
  large: { width: 3, height: 1 },
  full: { width: 4, height: 1 },
};

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const mergedWidgets = defaultWidgets.map(defaultWidget => {
          const storedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
          return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
        });
        return mergedWidgets.sort((a, b) => a.order - b.order);
      } catch {
        return defaultWidgets;
      }
    }
    return defaultWidgets;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const reorderWidgets = useCallback((sourceIndex: number, destinationIndex: number) => {
    const result = Array.from(widgets);
    const [removed] = result.splice(sourceIndex, 1);
    result.splice(destinationIndex, 0, removed);
    
    const reordered = result.map((widget, index) => ({
      ...widget,
      order: index,
    }));
    
    setWidgets(reordered);
  }, [widgets]);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgets(prev => 
      prev.map(widget => 
        widget.id === widgetId 
          ? { ...widget, visible: !widget.visible } 
          : widget
      )
    );
  }, []);

  const updateWidgetSize = useCallback((widgetId: string, newSize: WidgetSize) => {
    setWidgets(prev => 
      prev.map(widget => 
        widget.id === widgetId 
          ? { 
              ...widget, 
              size: newSize,
              width: sizeToGrid[newSize].width,
              height: sizeToGrid[newSize].height,
            } 
          : widget
      )
    );
  }, []);

  const updateWidgetPosition = useCallback((widgetId: string, column: number, row: number) => {
    setWidgets(prev => 
      prev.map(widget => 
        widget.id === widgetId 
          ? { ...widget, column, row } 
          : widget
      )
    );
  }, []);

  const moveWidget = useCallback((widgetId: string, direction: 'up' | 'down' | 'left' | 'right') => {
    setWidgets(prev => {
      const widget = prev.find(w => w.id === widgetId);
      if (!widget) return prev;

      let newColumn = widget.column ?? 0;
      let newRow = widget.row ?? 0;

      switch (direction) {
        case 'up': newRow = Math.max(0, newRow - 1); break;
        case 'down': newRow = newRow + 1; break;
        case 'left': newColumn = Math.max(0, newColumn - 1); break;
        case 'right': newColumn = Math.min(3, newColumn + 1); break;
      }

      return prev.map(w => 
        w.id === widgetId 
          ? { ...w, column: newColumn, row: newRow } 
          : w
      );
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setWidgets(defaultWidgets);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const visibleWidgets = widgets.filter(w => w.visible);
  
  // Progressive Disclosure: widgets by level
  const level1Widgets = visibleWidgets.filter(w => w.level === 1);
  const level2Widgets = visibleWidgets.filter(w => w.level === 2);
  const level3Widgets = visibleWidgets.filter(w => w.level === 3);

  return {
    widgets,
    visibleWidgets,
    level1Widgets,
    level2Widgets,
    level3Widgets,
    isEditMode,
    setIsEditMode,
    draggedWidget,
    setDraggedWidget,
    reorderWidgets,
    toggleWidgetVisibility,
    updateWidgetSize,
    updateWidgetPosition,
    moveWidget,
    resetToDefaults,
  };
}
