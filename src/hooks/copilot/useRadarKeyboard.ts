/**
 * CV-145–146: useRadarKeyboard — keyboard shortcuts for the RADAR panel.
 */
import { useEffect } from 'react';

export interface RadarShortcut {
  keys: string;
  action: string;
  description: string;
}

export interface UseRadarKeyboardHandlers {
  onTogglePanel?: () => void;
  onCycleMode?: () => void;
  onToggleGhostText?: () => void;
  onClose?: () => void;
}

export interface UseRadarKeyboardReturn {
  shortcuts: RadarShortcut[];
}

const SHORTCUTS: RadarShortcut[] = [
  { keys: 'Ctrl+Shift+R', action: 'togglePanel', description: 'Abrir/fechar painel RADAR' },
  { keys: 'Ctrl+Shift+M', action: 'cycleMode', description: 'Alternar modo (mini → normal → focus)' },
  { keys: 'Ctrl+Shift+G', action: 'toggleGhostText', description: 'Ativar/desativar texto fantasma' },
  { keys: 'Escape', action: 'close', description: 'Fechar painel RADAR' },
];

export function useRadarKeyboard(
  handlers: UseRadarKeyboardHandlers
): UseRadarKeyboardReturn {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && shift && e.key === 'R') {
        e.preventDefault();
        handlers.onTogglePanel?.();
        return;
      }
      if (ctrl && shift && e.key === 'M') {
        e.preventDefault();
        handlers.onCycleMode?.();
        return;
      }
      if (ctrl && shift && e.key === 'G') {
        e.preventDefault();
        handlers.onToggleGhostText?.();
        return;
      }
      if (e.key === 'Escape') {
        handlers.onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);

  return { shortcuts: SHORTCUTS };
}
