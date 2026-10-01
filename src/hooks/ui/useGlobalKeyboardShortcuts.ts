import { useEffect, useCallback, useRef } from 'react';
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
    'open-tasks-tab': () => {
      // Etapa 74 — o RealtimeInboxView (dono da aba ativa) escuta este evento e
      // leva o foco ao QuickAdd depois de montar a aba Tarefas (lazy).
      document.dispatchEvent(new CustomEvent('inbox-open-tasks-tab'));
    },
    'toggle-notifications': () => {
      document.dispatchEvent(new CustomEvent('toggle-notifications'));
    },
  };

  // A tabela de acoes mistura os defaults com `customActions`, que o provider
  // recria a cada render. Guardada numa ref, ela deixa de invalidar o listener
  // global a cada render e sai das deps do useCallback (gate do lint-ratchet).
  const actionsRef = useRef<Record<string, () => void>>({});
  useEffect(() => {
    const merged = { ...defaultActions };
    customActions?.forEach(({ id, action }) => {
      merged[id] = action;
    });
    actionsRef.current = merged;
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs (except for specific ones)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Allow Ctrl+K (global search) and Escape even in inputs
    const allowedInInputs = ['global-search', 'clear-selection', 'show-shortcuts-help', 'open-tasks-tab'];

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
        const action = actionsRef.current[shortcut.id];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action();
          return;
        }
      }
    }
  }, [shortcuts, getActiveBinding]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
}
