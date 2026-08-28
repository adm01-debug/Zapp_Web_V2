import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCustomShortcuts } from './useCustomShortcuts';

interface GlobalShortcutAction {
  id: string;
  action: () => void;
}

export function useGlobalKeyboardShortcuts(customActions?: GlobalShortcutAction[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const { shortcuts, getActiveBinding } = useCustomShortcuts();

  // Default global actions
  const defaultActions: Record<string, () => void> = {
    'global-search': () => {
      document.dispatchEvent(new CustomEvent('open-global-search'));
    },
    'go-to-inbox': () => {
      navigate('/');
      toast.info('📥 Inbox', { duration: 1500 });
    },
    'go-to-dashboard': () => {
      navigate('/');
      toast.info('📊 Dashboard', { duration: 1500 });
    },
    'go-to-contacts': () => {
      navigate('/');
      toast.info('👥 Contatos', { duration: 1500 });
    },
    'go-to-settings': () => {
      navigate('/');
      toast.info('⚙️ Configurações', { duration: 1500 });
    },
    'toggle-theme': () => {
      document.dispatchEvent(new CustomEvent('toggle-theme'));
    },
    'show-shortcuts-help': () => {
      document.dispatchEvent(new CustomEvent('show-shortcuts-help'));
    },
    'refresh-data': () => {
      window.location.reload();
    },
    'toggle-sidebar': () => {
      document.dispatchEvent(new CustomEvent('toggle-sidebar'));
    },
    'quick-compose': () => {
      document.dispatchEvent(new CustomEvent('quick-compose'));
    },
    'toggle-notifications': () => {
      document.dispatchEvent(new CustomEvent('toggle-notifications'));
    },
  };

  // Merge custom actions with defaults
  const actions = { ...defaultActions };
  customActions?.forEach(({ id, action }) => {
    actions[id] = action;
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs (except for specific ones)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Allow Ctrl+K (global search) and Escape even in inputs
    const allowedInInputs = ['global-search', 'clear-selection', 'show-shortcuts-help'];

    for (const shortcut of shortcuts) {
      const binding = getActiveBinding(shortcut);
      
      // Check if keys match
      if (!binding.key || !event.key) continue;
      const keyMatches = event.key.toLowerCase() === binding.key.toLowerCase();
      const ctrlMatches = !!event.ctrlKey === !!binding.modifiers.ctrlKey;
      const shiftMatches = !!event.shiftKey === !!binding.modifiers.shiftKey;
      const altMatches = !!event.altKey === !!binding.modifiers.altKey;

      if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
        // Skip if in input and not allowed
        if (isInput && !allowedInInputs.includes(shortcut.id)) {
          continue;
        }

        // Execute action if exists
        const action = actions[shortcut.id];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action();
          return;
        }
      }
    }
  }, [shortcuts, getActiveBinding, actions]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
}
