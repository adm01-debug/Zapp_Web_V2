import { useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/ui/use-toast';

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsProps) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow specific shortcuts even in inputs (like Ctrl+Enter)
      const allowedInInputs = shortcuts.filter(s => 
        s.ctrlKey && (s.key === 'Enter' || s.key === 'k')
      );
      
      for (const shortcut of allowedInInputs) {
        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          event.ctrlKey === (shortcut.ctrlKey || false) &&
          event.shiftKey === (shortcut.shiftKey || false) &&
          event.altKey === (shortcut.altKey || false)
        ) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
      return;
    }

    for (const shortcut of shortcuts) {
      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        event.ctrlKey === (shortcut.ctrlKey || false) &&
        event.shiftKey === (shortcut.shiftKey || false) &&
        event.altKey === (shortcut.altKey || false)
      ) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Predefined shortcuts for chat
export function useChatShortcuts({
  onSend,
  onToggleAI,
  onToggleTemplates,
  onTransfer,
  onResolve,
  onFocusInput,
}: {
  onSend?: () => void;
  onToggleAI?: () => void;
  onToggleTemplates?: () => void;
  onTransfer?: () => void;
  onResolve?: () => void;
  onFocusInput?: () => void;
}) {
  const { toast } = useToast();

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'Enter',
      ctrlKey: true,
      description: 'Enviar mensagem',
      action: () => onSend?.(),
    },
    {
      key: 'k',
      ctrlKey: true,
      description: 'Busca global',
      action: () => {
        toast({ title: 'Busca', description: 'Ctrl+K pressionado' });
      },
    },
    {
      key: 'i',
      ctrlKey: true,
      description: 'Sugestões de IA',
      action: () => onToggleAI?.(),
    },
    {
      key: 't',
      ctrlKey: true,
      description: 'Templates',
      action: () => onToggleTemplates?.(),
    },
    {
      key: 'r',
      ctrlKey: true,
      shiftKey: true,
      description: 'Marcar como resolvido',
      action: () => onResolve?.(),
    },
    {
      key: '/',
      description: 'Focar no campo de mensagem',
      action: () => onFocusInput?.(),
    },
  ];

  useKeyboardShortcuts({ shortcuts });

  return shortcuts;
}
